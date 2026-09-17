# Executa um plano de automação (JSON) usando a API de entrada do Windows.
# Chamado pelo aplicativo; imprime o andamento em linhas: PASSO n / VOLTA n / ERRO ... / FIM
param([Parameter(Mandatory = $true)][string]$Plano)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
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

    public static void Clique(string botao, int vezes, int intervalo)
    {
        uint baixo = MOUSEEVENTF_LEFTDOWN, cima = MOUSEEVENTF_LEFTUP;
        if (botao == "direito") { baixo = MOUSEEVENTF_RIGHTDOWN; cima = MOUSEEVENTF_RIGHTUP; }
        else if (botao == "meio") { baixo = MOUSEEVENTF_MIDDLEDOWN; cima = MOUSEEVENTF_MIDDLEUP; }
        for (int n = 0; n < vezes; n++)
        {
            Enviar(new INPUT[] { Mouse(baixo, 0), Mouse(cima, 0) });
            if (n + 1 < vezes) Thread.Sleep(intervalo);
        }
    }

    public static void Rolar(int cliques) { Enviar(new INPUT[] { Mouse(MOUSEEVENTF_WHEEL, unchecked((uint)(cliques * 120))) }); }

    public static void Atalho(ushort[] modificadores, ushort tecla)
    {
        foreach (ushort m in modificadores) Enviar(new INPUT[] { Tecla(m, 0, 0) });
        if (tecla != 0) Enviar(new INPUT[] { Tecla(tecla, 0, 0), Tecla(tecla, 0, KEYEVENTF_KEYUP) });
        for (int i = modificadores.Length - 1; i >= 0; i--) Enviar(new INPUT[] { Tecla(modificadores[i], 0, KEYEVENTF_KEYUP) });
    }

    // Digita qualquer caractere (inclusive acentos) sem depender do layout do teclado.
    public static void Texto(string texto, int atrasoPorLetra)
    {
        foreach (char c in texto)
        {
            if (c == '\n' || c == '\r') { Atalho(new ushort[0], 0x0D); continue; }
            Enviar(new INPUT[] { Tecla(0, c, KEYEVENTF_UNICODE), Tecla(0, c, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP) });
            if (atrasoPorLetra > 0) Thread.Sleep(atrasoPorLetra);
        }
    }
}
'@

[Entrada]::PrepararTela()

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

$dados = Get-Content -LiteralPath $Plano -Raw -Encoding UTF8 | ConvertFrom-Json
$atrasoPadrao = if ($dados.atrasoPadrao) { [int]$dados.atrasoPadrao } else { 120 }
$repeticoes = if ($dados.repeticoes) { [int]$dados.repeticoes } else { 1 }
$intervalo = if ($dados.intervalo) { [int]$dados.intervalo } else { 0 }

if ($dados.esperaInicial -gt 0) { Start-Sleep -Milliseconds ([int]$dados.esperaInicial) }

try {
  for ($volta = 1; $volta -le $repeticoes; $volta++) {
    $i = 0
    foreach ($passo in $dados.passos) {
      $i++
      Write-Output "PASSO $i"
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
        'rolar'   { [Entrada]::Rolar([int]$passo.quantidade) }
        'esperar' { Start-Sleep -Milliseconds ([int]$passo.ms) }
        default   { throw "passo desconhecido: $($passo.tipo)" }
      }
      $espera = if ($null -ne $passo.atraso) { [int]$passo.atraso } else { $atrasoPadrao }
      if ($passo.tipo -ne 'esperar' -and $espera -gt 0) { Start-Sleep -Milliseconds $espera }
    }
    Write-Output "VOLTA $volta"
    if ($volta -lt $repeticoes -and $intervalo -gt 0) { Start-Sleep -Milliseconds $intervalo }
  }
  Write-Output 'FIM'
} catch {
  Write-Output "ERRO $($_.Exception.Message)"
  exit 1
}
