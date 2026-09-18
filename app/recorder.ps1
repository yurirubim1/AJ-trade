# Grava o que você faz no computador (cliques, arrastos e teclas) e vai imprimindo
# um evento por linha, em JSON. O aplicativo transforma isso em passos.
# A leitura é por consulta ao teclado/mouse (GetAsyncKeyState), sem instalar ganchos no sistema.
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class Leitura
{
    [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
    [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
    [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] static extern int ToUnicodeEx(uint wVirtKey, uint wScanCode, byte[] lpKeyState, StringBuilder pwszBuff, int cchBuff, uint wFlags, IntPtr dwhkl);
    [DllImport("user32.dll")] static extern uint MapVirtualKeyEx(uint uCode, uint uMapType, IntPtr dwhkl);
    [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint idThread);

    public static bool Pressionada(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }

    public static POINT Cursor() { POINT p; GetCursorPos(out p); return p; }

    // Descobre a letra que a tecla produz no teclado do usuário (com acento, cedilha, etc.)
    public static string Letra(int vk, bool shift, bool ctrl, bool alt, bool caps)
    {
        IntPtr layout = GetKeyboardLayout(0);
        byte[] estado = new byte[256];
        if (shift) estado[0x10] = 0x80;
        if (ctrl) estado[0x11] = 0x80;
        if (alt) estado[0x12] = 0x80;
        if (caps) estado[0x14] = 0x01;
        StringBuilder buffer = new StringBuilder(8);
        uint scan = MapVirtualKeyEx((uint)vk, 0, layout);
        int n = ToUnicodeEx((uint)vk, scan, estado, buffer, buffer.Capacity, 0, layout);
        if (n <= 0) return "";
        return buffer.ToString(0, n);
    }
}
'@

[Leitura]::SetProcessDPIAware() | Out-Null

$NOMES = @{
  0x08 = 'backspace'; 0x09 = 'tab'; 0x0D = 'enter'; 0x1B = 'esc'; 0x20 = 'espaco';
  0x21 = 'pageup'; 0x22 = 'pagedown'; 0x23 = 'end'; 0x24 = 'home';
  0x25 = 'esquerda'; 0x26 = 'cima'; 0x27 = 'direita'; 0x28 = 'baixo'; 0x2E = 'delete';
}
foreach ($n in 1..12) { $NOMES[0x6F + $n] = "f$n" }

$MODS = @{ 0x11 = 'ctrl'; 0x10 = 'shift'; 0x12 = 'alt'; 0x5B = 'win'; 0x5C = 'win' }
$BOTOES = @{ 0x01 = 'esquerdo'; 0x02 = 'direito'; 0x04 = 'meio' }

# Teclas observadas: letras, números, teclado numérico, especiais e pontuação
$OBSERVADAS = @()
$OBSERVADAS += 0x08, 0x09, 0x0D, 0x1B, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2E
$OBSERVADAS += 0x30..0x39
$OBSERVADAS += 0x41..0x5A
$OBSERVADAS += 0x60..0x6F
$OBSERVADAS += 0x70..0x7B
$OBSERVADAS += 0xBA..0xC0
$OBSERVADAS += 0xDB..0xDF
$OBSERVADAS += 0xE2

$inicio = [Diagnostics.Stopwatch]::StartNew()
$anterior = @{}
$botaoAtivo = $null
$arrasteInicio = $null
$tempoBotao = 0

function Emitir([string]$json) { Write-Output $json; [Console]::Out.Flush() }
function Escapar([string]$t) { return ($t -replace '\\', '\\\\' -replace '"', '\"' -replace "`r", '' -replace "`n", '\n' -replace "`t", '\t') }

while ($true) {
  $agora = [int]$inicio.ElapsedMilliseconds
  $shift = [Leitura]::Pressionada(0x10); $ctrl = [Leitura]::Pressionada(0x11)
  $alt = [Leitura]::Pressionada(0x12); $win = [Leitura]::Pressionada(0x5B)
  $caps = ([Leitura]::GetAsyncKeyState(0x14) -band 1) -ne 0

  # mouse: clique simples ou arraste
  foreach ($vk in $BOTOES.Keys) {
    $agoraPressionado = [Leitura]::Pressionada($vk)
    $antes = [bool]$anterior["m$vk"]
    if ($agoraPressionado -and -not $antes) {
      $p = [Leitura]::Cursor()
      $botaoAtivo = $vk; $arrasteInicio = $p; $tempoBotao = $agora
    } elseif (-not $agoraPressionado -and $antes -and $botaoAtivo -eq $vk) {
      $p = [Leitura]::Cursor()
      $distancia = [Math]::Abs($p.X - $arrasteInicio.X) + [Math]::Abs($p.Y - $arrasteInicio.Y)
      if ($distancia -gt 12) {
        Emitir "{""tipo"":""arrastar"",""t"":$tempoBotao,""botao"":""$($BOTOES[$vk])"",""x"":$($arrasteInicio.X),""y"":$($arrasteInicio.Y),""x2"":$($p.X),""y2"":$($p.Y)}"
      } else {
        Emitir "{""tipo"":""clique"",""t"":$tempoBotao,""botao"":""$($BOTOES[$vk])"",""x"":$($arrasteInicio.X),""y"":$($arrasteInicio.Y)}"
      }
      $botaoAtivo = $null
    }
    $anterior["m$vk"] = $agoraPressionado
  }

  # teclado
  foreach ($vk in $OBSERVADAS) {
    $agoraPressionado = [Leitura]::Pressionada($vk)
    $antes = [bool]$anterior["k$vk"]
    $anterior["k$vk"] = $agoraPressionado
    if (-not $agoraPressionado -or $antes) { continue }
    $mods = @()
    if ($ctrl) { $mods += 'ctrl' }
    if ($alt) { $mods += 'alt' }
    if ($win) { $mods += 'win' }
    $listaMods = ($mods | ForEach-Object { """$_""" }) -join ','
    if ($NOMES.ContainsKey($vk)) {
      if ($shift) { $listaMods = if ($listaMods) { $listaMods + ',""shift""' } else { '"shift"' } }
      Emitir "{""tipo"":""tecla"",""t"":$agora,""tecla"":""$($NOMES[$vk])"",""mods"":[$listaMods]}"
      continue
    }
    if ($mods.Count -gt 0) {  # atalho: Ctrl+C, Alt+Tab...
      $nome = [char]$vk
      if ($vk -ge 0x41 -and $vk -le 0x5A) { $nome = ([string][char]$vk).ToLower() }
      elseif ($vk -ge 0x30 -and $vk -le 0x39) { $nome = [string][char]$vk }
      else { continue }
      if ($shift) { $listaMods = $listaMods + ',""shift""' }
      Emitir "{""tipo"":""tecla"",""t"":$agora,""tecla"":""$nome"",""mods"":[$listaMods]}"
      continue
    }
    $letra = [Leitura]::Letra($vk, $shift, $false, $false, $caps)
    if ($letra) { Emitir "{""tipo"":""letra"",""t"":$agora,""c"":""$(Escapar $letra)""}" }
  }

  Start-Sleep -Milliseconds 10
}
