// Guarda e executa as automações da aba "Automação".
// A execução acontece num PowerShell separado (app/runner.ps1), para poder ser
// interrompida a qualquer momento sem travar o aplicativo.
import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';

const POWERSHELL = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;

// Junta o que o gravador viu num roteiro de passos: letras seguidas viram um texto só,
// e as pausas entre as ações viram passos de espera.
export function eventosParaPassos(eventos, { pausaMinima = 300 } = {}) {
  const passos = [];
  let anterior = null, texto = null;
  const fecharTexto = () => { if (texto) { passos.push({ tipo: 'texto', texto: texto.valor, atrasoPorLetra: 0, atraso: 0 }); texto = null; } };
  for (const e of eventos) {
    const pausa = anterior == null ? 0 : e.t - anterior;
    if (e.tipo === 'letra' && texto && pausa < 1500) { texto.valor += e.c; anterior = e.t; continue; }
    fecharTexto();
    if (pausa >= pausaMinima) passos.push({ tipo: 'esperar', ms: Math.round(pausa / 50) * 50 });
    if (e.tipo === 'letra') texto = { valor: e.c };
    else if (e.tipo === 'clique') passos.push({ tipo: 'clique', x: e.x, y: e.y, botao: e.botao, vezes: 1, atraso: 0 });
    else if (e.tipo === 'arrastar') passos.push({ tipo: 'arrastar', x: e.x, y: e.y, x2: e.x2, y2: e.y2, botao: e.botao, atraso: 0 });
    else if (e.tipo === 'tecla') passos.push({ tipo: 'tecla', tecla: e.tecla, modificadores: e.mods || [], atraso: 0 });
    anterior = e.t;
  }
  fecharTexto();
  return passos;
}

export class Macros {
  constructor({ appRoot, userDir, onEvent }) {
    this.runnerSource = path.join(appRoot, 'app', 'runner.ps1');
    this.recorderSource = path.join(appRoot, 'app', 'recorder.ps1');
    this.dir = path.join(userDir, 'macros');
    this.runDir = path.join(userDir, 'execucao');
    this.onEvent = onEvent;
    this.child = null;
    this.recorder = null;
    fs.mkdirSync(this.dir, { recursive: true });
    fs.mkdirSync(this.runDir, { recursive: true });
  }

  get recording() { return !!this.recorder; }

  startRecording() {
    if (this.recorder || this.child) return false;
    const script = path.join(this.runDir, 'recorder.ps1');
    fs.writeFileSync(script, fs.readFileSync(this.recorderSource));
    const eventos = [];
    const proc = spawn(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true });
    this.recorder = { proc, eventos, inicio: Date.now() };
    let buffer = '';
    proc.stdout.on('data', chunk => {
      if (this.recorder?.proc !== proc) return; // gravação já encerrada: o que chegar atrasado é descartado
      buffer += chunk.toString('utf8');
      const linhas = buffer.split(/\r?\n/);
      buffer = linhas.pop() || '';
      for (const linha of linhas.map(l => l.trim()).filter(Boolean)) {
        try { eventos.push(JSON.parse(linha)); } catch { continue; }
        this.onEvent({ tipo: 'gravando', total: eventos.length });
      }
    });
    proc.on('close', () => { this.recorder = null; });
    this.onEvent({ tipo: 'gravando', total: 0 });
    return true;
  }

  // Limpa o que é do próprio ato de gravar: a tecla que liga/desliga, os cliques dentro
  // das janelas do aplicativo (o botão Gravar, por exemplo) e o finzinho da gravação.
  stopRecording({ teclaIgnorar = '', areas = [], margemFinal = 500 } = {}) {
    if (!this.recorder) return [];
    const { proc, eventos, inicio } = this.recorder;
    this.recorder = null;
    execFile('taskkill', ['/pid', String(proc.pid), '/t', '/f'], () => {});

    const fim = Date.now() - inicio;
    const dentroDoApp = e => areas.some(a => e.x >= a.x && e.x <= a.x + a.width && e.y >= a.y && e.y <= a.y + a.height);
    const limpos = eventos.filter(e => {
      if (teclaIgnorar && e.tipo === 'tecla' && e.tecla === teclaIgnorar) return false;
      if ((e.tipo === 'clique' || e.tipo === 'arrastar') && dentroDoApp(e)) return false;
      if (e.t > fim - margemFinal) return false; // o clique ou a tecla que encerrou a gravação
      return true;
    });
    const passos = eventosParaPassos(limpos);
    while (passos.length && passos[passos.length - 1].tipo === 'esperar') passos.pop(); // pausa antes de encerrar
    this.onEvent({ tipo: 'gravado', passos });
    return passos;
  }

  list() {
    return fs.readdirSync(this.dir).filter(f => f.endsWith('.json')).map(f => {
      try { return JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8')); } catch { return null; }
    }).filter(Boolean).sort((a, b) => (b.salvoEm || '').localeCompare(a.salvoEm || ''));
  }

  save(macro) {
    const id = macro.id || `m${Date.now().toString(36)}`;
    const saved = { ...macro, id, salvoEm: new Date().toISOString() };
    fs.writeFileSync(path.join(this.dir, `${id}.json`), JSON.stringify(saved, null, 2));
    return saved;
  }

  remove(id) {
    const file = path.join(this.dir, `${path.basename(id)}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  get running() { return !!this.child; }

  run(plan) {
    if (this.child) throw new Error('Já tem uma automação rodando.');
    if (!plan?.passos?.length) throw new Error('A automação não tem nenhum passo.');
    // o runner sai do pacote para o disco: o PowerShell não lê de dentro do app.asar
    const runner = path.join(this.runDir, 'runner.ps1');
    fs.writeFileSync(runner, fs.readFileSync(this.runnerSource));
    const planFile = path.join(this.runDir, 'plano.json');
    fs.writeFileSync(planFile, JSON.stringify(plan), 'utf8');

    this.child = spawn(POWERSHELL, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', runner, '-Plano', planFile], { windowsHide: true });
    this.onEvent({ tipo: 'inicio', passos: plan.passos.length, repeticoes: plan.repeticoes || 1 });

    let buffer = '';
    this.child.stdout.on('data', chunk => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines.map(l => l.trim()).filter(Boolean)) {
        const [tag, ...rest] = line.split(' ');
        if (tag === 'PASSO') this.onEvent({ tipo: 'passo', passo: Number(rest[0]) });
        else if (tag === 'VOLTA') this.onEvent({ tipo: 'volta', volta: Number(rest[0]) });
        else if (tag === 'ERRO') this.onEvent({ tipo: 'erro', mensagem: rest.join(' ') });
        else if (tag === 'FIM') this.onEvent({ tipo: 'fim' });
      }
    });
    this.child.stderr.on('data', chunk => this.onEvent({ tipo: 'erro', mensagem: chunk.toString('utf8').trim().split('\n')[0] }));
    this.child.on('close', code => { this.child = null; this.onEvent({ tipo: 'parou', code }); });
    return { passos: plan.passos.length };
  }

  stop() {
    if (!this.child) return false;
    const pid = this.child.pid;
    this.child = null;
    execFile('taskkill', ['/pid', String(pid), '/t', '/f'], () => {}); // mata o PowerShell e o que ele abriu
    this.onEvent({ tipo: 'parou', code: null });
    return true;
  }
}
