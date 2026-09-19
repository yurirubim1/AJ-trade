# Executa um plano de automação (JSON) usando a API de entrada do Windows.
# Chamado pelo aplicativo; imprime o andamento em linhas: PASSO n / VOLTA n / ERRO ... / FIM
param([Parameter(Mandatory = $true)][string]$Plano)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Threading;

public static class Entrada
{
    [StructLayout(LayoutKind.Sequential)]
    public struct MOUSEINPUT { public int dx; public int dy; public uint mouseData; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    public struct KEYBDINPUT { public ushort wVk; public ushort wScan; public uint dwFlags; public uint time; public IntPtr dwExtraInfo; }
    [StructLayout(LayoutKind.Sequential)]
    public struct HARDWAREINPUT { public uint uMsg; public ushort wParamL; public ushort wParamH; }
    [StructLayout(LayoutKind.Explicit)]
    public struct INPUTUNION {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
        [FieldOffset(0)] public HARDWAREINPUT hi;
    }
    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT { public uint type; public INPUTUNION u; }

    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
    [DllImport("user32.dll")] private static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] private static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] private static extern short VkKeyScanEx(char ch, IntPtr dwhkl);
    [DllImport("user32.dll")] private static extern IntPtr GetKeyboardLayout(uint idThread);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr processId);

    private const uint INPUT_MOUSE = 0;
    private const uint INPUT_KEYBOARD = 1;
    private const uint MOUSEEVENTF_LEFTDOWN = 0x0002, MOUSEEVENTF_LEFTUP = 0x0004;
    private const uint MOUSEEVENTF_RIGHTDOWN = 0x0008, MOUSEEVENTF_RIGHTUP = 0x0010;
    private const uint MOUSEEVENTF_MIDDLEDOWN = 0x0020, MOUSEEVENTF_MIDDLEUP = 0x0040;
    private const uint MOUSEEVENTF_WHEEL = 0x0800;
    private const uint KEYEVENTF_KEYUP = 0x0002, KEYEVENTF_UNICODE = 0x0004;

    public static void PrepararTela() { SetProcessDPIAware(); }

    private static void Enviar(INPUT[] entradas) { SendInput((uint)entradas.Length, entradas, Marshal.SizeOf(typeof(INPUT))); }

    private static INPUT Mouse(uint flags, uint dados)
    {
        INPUT i = new INPUT();
        i.type = INPUT_MOUSE;
        i.u.mi.dwFlags = flags;
        i.u.mi.mouseData = dados;
        return i;
    }

    private static INPUT Tecla(ushort vk, ushort scan, uint flags)
    {
        INPUT i = new INPUT();
        i.type = INPUT_KEYBOARD;
        i.u.ki.wVk = vk;
        i.u.ki.wScan = scan;
        i.u.ki.dwFlags = flags;
        return i;
    }

    public static void Mover(int x, int y) { SetCursorPos(x, y); }

    // Segurar por alguns milissegundos faz o clique/tecla ser aceito por programas
    // que ignoram toques instantâneos (e deixa a gravação conseguir enxergá-los).
    private const int PRESSAO = 25;

    public static void Clique(string botao, int vezes, int intervalo)
    {
        uint baixo = MOUSEEVENTF_LEFTDOWN, cima = MOUSEEVENTF_LEFTUP;
        if (botao == "direito") { baixo = MOUSEEVENTF_RIGHTDOWN; cima = MOUSEEVENTF_RIGHTUP; }
        else if (botao == "meio") { baixo = MOUSEEVENTF_MIDDLEDOWN; cima = MOUSEEVENTF_MIDDLEUP; }
        for (int n = 0; n < vezes; n++)
        {
            Enviar(new INPUT[] { Mouse(baixo, 0) });
            Thread.Sleep(PRESSAO);
            Enviar(new INPUT[] { Mouse(cima, 0) });
            if (n + 1 < vezes) Thread.Sleep(intervalo);
        }
    }

    public static void Rolar(int cliques) { Enviar(new INPUT[] { Mouse(MOUSEEVENTF_WHEEL, unchecked((uint)(cliques * 120))) }); }

    // Segura o botão, arrasta em pequenos passos (senão muitos programas ignoram) e solta.
    public static void Arrastar(int x1, int y1, int x2, int y2, string botao)
    {
        uint baixo = MOUSEEVENTF_LEFTDOWN, cima = MOUSEEVENTF_LEFTUP;
        if (botao == "direito") { baixo = MOUSEEVENTF_RIGHTDOWN; cima = MOUSEEVENTF_RIGHTUP; }
        else if (botao == "meio") { baixo = MOUSEEVENTF_MIDDLEDOWN; cima = MOUSEEVENTF_MIDDLEUP; }
        SetCursorPos(x1, y1);
        Thread.Sleep(60);
        Enviar(new INPUT[] { Mouse(baixo, 0) });
        const int partes = 24;
        for (int i = 1; i <= partes; i++)
        {
            SetCursorPos(x1 + (x2 - x1) * i / partes, y1 + (y2 - y1) * i / partes);
            Thread.Sleep(12);
        }
        Thread.Sleep(60);
        Enviar(new INPUT[] { Mouse(cima, 0) });
    }

    public static void Atalho(ushort[] modificadores, ushort tecla)
    {
        foreach (ushort m in modificadores) { Enviar(new INPUT[] { Tecla(m, 0, 0) }); Thread.Sleep(10); }
        if (tecla != 0)
        {
            Enviar(new INPUT[] { Tecla(tecla, 0, 0) });
            Thread.Sleep(PRESSAO);
            Enviar(new INPUT[] { Tecla(tecla, 0, KEYEVENTF_KEYUP) });
        }
        for (int i = modificadores.Length - 1; i >= 0; i--) { Thread.Sleep(10); Enviar(new INPUT[] { Tecla(modificadores[i], 0, KEYEVENTF_KEYUP) }); }
    }

    // Digita como se fosse o teclado de verdade: descobre qual tecla (e se precisa de Shift
    // ou AltGr) produz cada letra no layout de quem está na frente. Programas que ignoram
    // texto "injetado" — navegadores e jogos, por exemplo — aceitam assim.
    public static void Texto(string texto, int atrasoPorLetra)
    {
        IntPtr layout = GetKeyboardLayout(GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero));
        foreach (char c in texto)
        {
            if (c == '\n' || c == '\r') { Atalho(new ushort[0], 0x0D); continue; }
            short achada = VkKeyScanEx(c, layout);
            if (achada != -1)
            {
                ushort vk = (ushort)(achada & 0xFF);
                int estado = (achada >> 8) & 0xFF;
                List<ushort> mods = new List<ushort>();
                if ((estado & 1) != 0) mods.Add(0x10);  // shift
                if ((estado & 2) != 0) mods.Add(0x11);  // ctrl
                if ((estado & 4) != 0) mods.Add(0x12);  // alt
                Atalho(mods.ToArray(), vk);
            }
            else // letra que não existe no teclado atual: manda como caractere solto
            {
                Enviar(new INPUT[] { Tecla(0, c, KEYEVENTF_UNICODE) });
                Thread.Sleep(15);
                Enviar(new INPUT[] { Tecla(0, c, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP) });
            }
            Thread.Sleep(atrasoPorLetra > 0 ? atrasoPorLetra : 10);
        }
    }
}
'@

[Entrada]::PrepararTela()

# ---------- visão: procurar uma imagem recortada dentro da tela ----------
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class Visao
{
    [DllImport("user32.dll")] private static extern int GetSystemMetrics(int indice);

    public class Resultado { public bool Achou; public int X; public int Y; public double Nota = 255; public int Indice = -1; }

    private static int[] Pixels(Bitmap bmp)
    {
        int w = bmp.Width, h = bmp.Height;
        BitmapData dados = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        int[] px = new int[w * h];
        for (int y = 0; y < h; y++) Marshal.Copy(IntPtr.Add(dados.Scan0, y * dados.Stride), px, y * w, w);
        bmp.UnlockBits(dados);
        return px;
    }

    // Todos os monitores juntos, em pixels de verdade.
    public static Rectangle TelaInteira() { return new Rectangle(GetSystemMetrics(76), GetSystemMetrics(77), GetSystemMetrics(78), GetSystemMetrics(79)); }

    public static Bitmap Capturar(Rectangle area)
    {
        Bitmap bmp = new Bitmap(area.Width, area.Height, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp)) g.CopyFromScreen(area.X, area.Y, 0, 0, area.Size, CopyPixelOperation.SourceCopy);
        return bmp;
    }

    // Diferença de cor entre o modelo e a imagem numa posição. Desiste (devolve long.MaxValue)
    // assim que a média parcial passa do limite: em posições erradas isso acontece em poucos pontos.
    private static long Custo(int[] I, int inicio, int[] desloc, int[] cr, int[] cg, int[] cb, int n, double mediaMaxima)
    {
        long soma = 0;
        double porPonto = mediaMaxima * 3;
        for (int k = 0; k < n; k++)
        {
            int c = I[inicio + desloc[k]];
            soma += Math.Abs(((c >> 16) & 255) - cr[k]) + Math.Abs(((c >> 8) & 255) - cg[k]) + Math.Abs((c & 255) - cb[k]);
            if (soma > porPonto * (k + 1) + 120) return long.MaxValue;
        }
        return soma;
    }

    // Procura o modelo dentro da imagem. tolerancia = diferença média aceita por canal de cor (0 a 255).
    // Primeiro varre de 2 em 2 pixels com folga maior e guarda os melhores candidatos;
    // depois confere cada candidato pixel a pixel com a tolerância de verdade.
    public static Resultado Procurar(Bitmap imagem, Bitmap modelo, double tolerancia)
    {
        Resultado r = new Resultado();
        int iw = imagem.Width, ih = imagem.Height, mw = modelo.Width, mh = modelo.Height;
        if (mw == 0 || mh == 0 || mw > iw || mh > ih) return r;
        int[] I = Pixels(imagem), M = Pixels(modelo);

        // até ~600 pontos do modelo, em ordem sorteada, para as diferenças aparecerem logo
        int passo = Math.Max(1, (int)Math.Sqrt(mw * mh / 600.0));
        List<int> pontos = new List<int>();
        for (int y = 0; y < mh; y += passo) for (int x = 0; x < mw; x += passo) pontos.Add(y * mw + x);
        Random sorteio = new Random(7);
        for (int k = pontos.Count - 1; k > 0; k--) { int j = sorteio.Next(k + 1); int t = pontos[k]; pontos[k] = pontos[j]; pontos[j] = t; }
        int n = pontos.Count;
        int[] desloc = new int[n], cr = new int[n], cg = new int[n], cb = new int[n];
        for (int k = 0; k < n; k++)
        {
            int p = pontos[k];
            desloc[k] = (p / mw) * iw + (p % mw);
            int c = M[p];
            cr[k] = (c >> 16) & 255; cg[k] = (c >> 8) & 255; cb[k] = c & 255;
        }

        // etapa 1: grade grossa
        double folga = Math.Max(tolerancia * 2.5, tolerancia + 25);
        List<long[]> candidatos = new List<long[]>();
        long corte = long.MaxValue;
        for (int y = 0; y <= ih - mh; y += 2)
        {
            for (int x = 0; x <= iw - mw; x += 2)
            {
                long custo = Custo(I, y * iw + x, desloc, cr, cg, cb, n, folga);
                if (custo >= corte || custo == long.MaxValue) continue;
                candidatos.Add(new long[] { custo, x, y });
                if (candidatos.Count > 16)
                {
                    candidatos.Sort((a, b) => a[0].CompareTo(b[0]));
                    candidatos.RemoveRange(8, candidatos.Count - 8);
                    corte = candidatos[candidatos.Count - 1][0];
                }
            }
        }

        // etapa 2: refino em volta de cada candidato
        long limite = (long)(tolerancia * 3 * n);
        long melhor = long.MaxValue;
        int bx = -1, by = -1;
        foreach (long[] cand in candidatos)
        {
            for (int y = (int)cand[2] - 1; y <= (int)cand[2] + 1; y++)
            {
                for (int x = (int)cand[1] - 1; x <= (int)cand[1] + 1; x++)
                {
                    if (x < 0 || y < 0 || x > iw - mw || y > ih - mh) continue;
                    long custo = Custo(I, y * iw + x, desloc, cr, cg, cb, n, tolerancia * 1.5);
                    if (custo < melhor) { melhor = custo; bx = x; by = y; }
                }
            }
        }
        if (bx >= 0 && melhor <= limite) { r.Achou = true; r.X = bx + mw / 2; r.Y = by + mh / 2; r.Nota = melhor / (3.0 * n); }
        return r;
    }
}
'@

$TECLAS = @{
  'enter' = 0x0D; 'tab' = 0x09; 'esc' = 0x1B; 'escape' = 0x1B; 'espaco' = 0x20; 'space' = 0x20;
  'backspace' = 0x08; 'delete' = 0x2E; 'insert' = 0x2D; 'home' = 0x24; 'end' = 0x23;
  'pageup' = 0x21; 'pagedown' = 0x22; 'cima' = 0x26; 'baixo' = 0x28; 'esquerda' = 0x25; 'direita' = 0x27;
  'up' = 0x26; 'down' = 0x28; 'left' = 0x25; 'right' = 0x27; 'printscreen' = 0x2C; 'capslock' = 0x14;
}
foreach ($n in 1..24) { $TECLAS["f$n"] = 0x6F + $n }
foreach ($c in [char[]]'ABCDEFGHIJKLMNOPQRSTUVWXYZ') { $TECLAS[([string]$c).ToLower()] = [int][char]$c }
foreach ($d in 0..9) { $TECLAS["$d"] = 0x30 + $d }
$MODIFICADORES = @{ 'ctrl' = 0x11; 'shift' = 0x10; 'alt' = 0x12; 'win' = 0x5B }

function Resolver-Tecla([string]$nome) {
  $chave = $nome.Trim().ToLower()
  if ($TECLAS.ContainsKey($chave)) { return [uint16]$TECLAS[$chave] }
  if ($MODIFICADORES.ContainsKey($chave)) { return [uint16]0 }
  throw "tecla desconhecida: $nome"
}

$modelos = @{}
function Carregar-Modelo([string]$arquivo) {
  if (-not $modelos.ContainsKey($arquivo)) { $modelos[$arquivo] = New-Object System.Drawing.Bitmap -ArgumentList $arquivo }
  return $modelos[$arquivo]
}

# Fotografa a área do passo (ou a tela toda) e procura as imagens dele, na ordem. Devolve a primeira achada.
function Buscar-Imagens($passo) {
  $area = if ($passo.area) {
    New-Object System.Drawing.Rectangle -ArgumentList ([int]$passo.area.x), ([int]$passo.area.y), ([int]$passo.area.w), ([int]$passo.area.h)
  } else { [Visao]::TelaInteira() }
  $tolerancia = if ($passo.tolerancia) { [double]$passo.tolerancia } else { 20 }
  $foto = [Visao]::Capturar($area)
  try {
    $indice = 0
    foreach ($arquivo in @($passo.arquivos)) {
      if ($arquivo -and (Test-Path -LiteralPath $arquivo)) {
        $r = [Visao]::Procurar($foto, (Carregar-Modelo $arquivo), $tolerancia)
        if ($r.Achou) { $r.X += $area.X; $r.Y += $area.Y; $r.Indice = $indice; return $r }
      }
      $indice++
    }
  } finally { $foto.Dispose() }
  return $null
}

function Contar-Achado($r) { Write-Output ("VISAO achou {0} {1} {2} {3}" -f $r.X, $r.Y, [Math]::Round($r.Nota, 1), ($r.Indice + 1)) }

# Para onde ir depois: 'proximo', 'parar' ou o número de um passo.
function Destino($valor, [int]$atual) {
  if ($null -eq $valor -or "$valor" -eq '' -or "$valor" -eq 'proximo') { return $atual + 1 }
  if ("$valor" -eq 'parar') { return -1 }
  return [int]$valor - 1
}

$dados = Get-Content -LiteralPath $Plano -Raw -Encoding UTF8 | ConvertFrom-Json
$atrasoPadrao = if ($null -ne $dados.atrasoPadrao) { [int]$dados.atrasoPadrao } else { 120 }
$repeticoes = if ($null -ne $dados.repeticoes) { [int]$dados.repeticoes } else { 1 }
$semFim = $repeticoes -le 0
$intervalo = if ($dados.intervalo) { [int]$dados.intervalo } else { 0 }
$lista = @($dados.passos)
$total = $lista.Count
$SEM_ESPERA_PADRAO = @('esperar', 'irPara', 'seImagem', 'esperarImagem', 'avisar')

# Sempre uma folga antes do primeiro comando: quando este processo abre, o Windows
# leva um instante para devolver o foco à janela em que a automação deve agir.
$esperaInicial = if ($dados.esperaInicial) { [int]$dados.esperaInicial } else { 0 }
Start-Sleep -Milliseconds ([Math]::Max(350, $esperaInicial))

try {
  $volta = 0
  $parar = $false
  while (-not $parar -and ($semFim -or $volta -lt $repeticoes)) {
    $volta++
    $i = 0
    while ($i -ge 0 -and $i -lt $total) {
      $passo = $lista[$i]
      Write-Output "PASSO $($i + 1)"
      $proximo = $i + 1
      switch ($passo.tipo) {
        'mover'   { [Entrada]::Mover([int]$passo.x, [int]$passo.y) }
        'clique'  {
          if ($null -ne $passo.x) { [Entrada]::Mover([int]$passo.x, [int]$passo.y); Start-Sleep -Milliseconds 40 }
          $vezes = if ($passo.vezes) { [int]$passo.vezes } else { 1 }
          $botao = if ($passo.botao) { [string]$passo.botao } else { 'esquerdo' }
          [Entrada]::Clique($botao, $vezes, 60)
        }
        'texto'   { [Entrada]::Texto([string]$passo.texto, [int]$passo.atrasoPorLetra) }
        'tecla'   {
          $mods = @()
          foreach ($m in @($passo.modificadores)) { if ($m -and $MODIFICADORES.ContainsKey([string]$m)) { $mods += [uint16]$MODIFICADORES[[string]$m] } }
          [Entrada]::Atalho([uint16[]]$mods, (Resolver-Tecla ([string]$passo.tecla)))
        }
        'arrastar' {
          $botao = if ($passo.botao) { [string]$passo.botao } else { 'esquerdo' }
          [Entrada]::Arrastar([int]$passo.x, [int]$passo.y, [int]$passo.x2, [int]$passo.y2, $botao)
        }
        'rolar'   { [Entrada]::Rolar([int]$passo.quantidade) }
        'esperar' { Start-Sleep -Milliseconds ([int]$passo.ms) }
        'esperarImagem' {
          # modo 'aparecer' espera surgir; modo 'sumir' espera deixar de estar na tela
          $sumir = $passo.modo -eq 'sumir'
          $limite = [int]$passo.limite
          $relogio = [Diagnostics.Stopwatch]::StartNew()
          $achado = Buscar-Imagens $passo
          while ((($sumir -and $achado) -or (-not $sumir -and -not $achado)) -and ($limite -le 0 -or $relogio.ElapsedMilliseconds -lt $limite)) {
            Start-Sleep -Milliseconds 250
            $achado = Buscar-Imagens $passo
          }
          $conseguiu = if ($sumir) { -not $achado } else { [bool]$achado }
          if ($conseguiu -and $achado -and $passo.clicar) {
            [Entrada]::Mover($achado.X, $achado.Y); Start-Sleep -Milliseconds 40
            [Entrada]::Clique('esquerdo', 1, 60)
          }
          if ($conseguiu) { if ($achado) { Contar-Achado $achado } else { Write-Output 'VISAO sumiu' } }
          else { Write-Output 'VISAO tempo'; $proximo = Destino ($(if ($passo.seNaoAchar) { $passo.seNaoAchar } else { 'parar' })) $i }
        }
        'avisar' { Write-Output ("AVISO " + ([string]$passo.texto -replace "[`r`n]+", ' ')) }
        'cliqueImagem' {
          $achado = Buscar-Imagens $passo
          if ($achado) {
            Contar-Achado $achado
            [Entrada]::Mover($achado.X, $achado.Y); Start-Sleep -Milliseconds 40
            $botao = if ($passo.botao) { [string]$passo.botao } else { 'esquerdo' }
            [Entrada]::Clique($botao, 1, 60)
          } else { Write-Output 'VISAO nao'; $proximo = Destino ($(if ($passo.seNaoAchar) { $passo.seNaoAchar } else { 'parar' })) $i }
        }
        'seImagem' {
          $achado = Buscar-Imagens $passo
          if ($achado) { Contar-Achado $achado; $proximo = Destino $passo.entao $i }
          else { Write-Output 'VISAO nao'; $proximo = Destino $passo.senao $i }
        }
        'irPara'  { $proximo = Destino $passo.passo $i }
        default   { throw "passo desconhecido: $($passo.tipo)" }
      }
      $espera = if ($null -ne $passo.atraso) { [int]$passo.atraso } elseif ($SEM_ESPERA_PADRAO -contains $passo.tipo) { 0 } else { $atrasoPadrao }
      if ($espera -gt 0) { Start-Sleep -Milliseconds $espera }
      if ($proximo -lt 0) { $parar = $true; break }
      $i = $proximo
      Start-Sleep -Milliseconds 5  # evita girar sem parar quando os passos só pulam entre si
    }
    Write-Output "VOLTA $volta"
    if (-not $parar -and ($semFim -or $volta -lt $repeticoes) -and $intervalo -gt 0) { Start-Sleep -Milliseconds $intervalo }
  }
  Write-Output 'FIM'
} catch {
  Write-Output "ERRO $($_.Exception.Message)"
  exit 1
}
