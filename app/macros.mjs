// Guarda e executa as automações da aba "Automação".
// A execução acontece num PowerShell separado (app/runner.ps1), para poder ser
// interrompida a qualquer momento sem travar o aplicativo.
import fs from 'fs';
import path from 'path';
import { spawn, execFile } from 'child_process';

const POWERSHELL = `${process.env.SystemRoot || 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;

export class Macros {
  constructor({ appRoot, userDir, onEvent }) {
    this.runnerSource = path.join(appRoot, 'app', 'runner.ps1');
    this.dir = path.join(userDir, 'macros');
    this.runDir = path.join(userDir, 'execucao');
    this.onEvent = onEvent;
    this.child = null;
    fs.mkdirSync(this.dir, { recursive: true });
    fs.mkdirSync(this.runDir, { recursive: true });
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
