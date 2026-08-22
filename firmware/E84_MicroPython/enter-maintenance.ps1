param(
    [string]$Port = 'COM23',
    [string]$KitProgSerial = '0C1C1698012D2400',
    [string]$OpenOcdRoot = (Join-Path ([IO.Path]::GetTempPath()) 'wheelsense-e84-micropython-v1.0.0\openocd')
)

$ErrorActionPreference = 'Stop'
$openOcd = Join-Path $OpenOcdRoot 'bin\openocd.exe'
$scripts = Join-Path $OpenOcdRoot 'scripts'
if (-not (Test-Path -LiteralPath $openOcd)) {
    throw "OpenOCD not found: $openOcd"
}

$interruptJob = Start-Job -ArgumentList $Port -ScriptBlock {
    param($SerialPort)
    python -c "import serial,time; s=serial.Serial('$SerialPort',115200,timeout=0.1); [(s.write(b'\x03'),time.sleep(0.1)) for _ in range(150)]; s.close()"
}

try {
    & $openOcd -s $scripts -c "source [find interface/kitprog3.cfg]; adapter serial $KitProgSerial; transport select swd; source [find target/infineon/pse84xgxs2.cfg]; init; reset halt; sleep 3000; resume; sleep 8000; shutdown;"
    if ($LASTEXITCODE -ne 0) { throw 'OpenOCD reset/resume failed' }
} finally {
    Wait-Job -Job $interruptJob -Timeout 20 | Out-Null
    Receive-Job -Job $interruptJob
    Remove-Job -Job $interruptJob -Force
}

python -m mpremote connect $Port exec "print('WheelSense maintenance ready')"
if ($LASTEXITCODE -ne 0) { throw 'MicroPython REPL did not enter maintenance mode' }
