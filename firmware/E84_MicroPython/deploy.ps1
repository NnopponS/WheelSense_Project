param([string]$Port = 'COM23')

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildRoot = Join-Path ([IO.Path]::GetTempPath()) ('wheelsense-e84-mpy-' + $PID)
$mpyCross = Get-Command mpy-cross -ErrorAction SilentlyContinue

if (-not $mpyCross) {
    throw 'mpy-cross is required. Install it with: python -m pip install mpy-cross==1.28.0.post2'
}

New-Item -ItemType Directory -Force -Path (Join-Path $buildRoot 'umqtt') | Out-Null

$modules = @('ble_node', 'sensors', 'node', 'native_bridge', 'provision', 'runtime')
foreach ($module in $modules) {
    & $mpyCross.Source -O3 -o (Join-Path $buildRoot ($module + '.mpy')) (Join-Path $root ($module + '.py'))
    if ($LASTEXITCODE -ne 0) { throw "Compile failed: $module.py" }
}
& $mpyCross.Source -O3 -o (Join-Path $buildRoot 'wheelsense_app.mpy') (Join-Path $root 'main.py')
if ($LASTEXITCODE -ne 0) { throw 'Compile failed: main.py' }
foreach ($module in @('__init__', 'simple')) {
    & $mpyCross.Source -O3 -o (Join-Path $buildRoot "umqtt\$module.mpy") (Join-Path $root "umqtt\$module.py")
    if ($LASTEXITCODE -ne 0) { throw "Compile failed: umqtt/$module.py" }
}

python -m mpremote connect $Port exec "print('WheelSense maintenance ready')"
if ($LASTEXITCODE -ne 0) {
    throw 'Cannot enter MicroPython REPL. Run enter-maintenance.ps1, then run deploy.ps1 again.'
}

try { python -m mpremote connect $Port fs mkdir :umqtt 2>$null } catch { }
$files = @('ble_node.mpy', 'sensors.mpy', 'node.mpy', 'native_bridge.mpy', 'provision.mpy', 'runtime.mpy', 'wheelsense_app.mpy')
foreach ($file in $files) {
    python -m mpremote connect $Port fs cp (Join-Path $buildRoot $file) (':' + $file)
    if ($LASTEXITCODE -ne 0) { throw "Upload failed: $file" }
}
foreach ($file in @('__init__.mpy', 'simple.mpy')) {
    python -m mpremote connect $Port fs cp (Join-Path $buildRoot "umqtt\$file") (':umqtt/' + $file)
    if ($LASTEXITCODE -ne 0) { throw "Upload failed: umqtt/$file" }
}
python -m mpremote connect $Port fs cp (Join-Path $root 'boot_main.py') :main.py
if ($LASTEXITCODE -ne 0) { throw 'Upload failed: boot_main.py' }

foreach ($file in @('main.mpy', 'ble_node.py', 'sensors.py', 'node.py', 'native_bridge.py', 'provision.py', 'runtime.py')) {
    try { python -m mpremote connect $Port fs rm (':' + $file) 2>$null } catch { }
}
foreach ($file in @('__init__.py', 'simple.py')) {
    try { python -m mpremote connect $Port fs rm (':umqtt/' + $file) 2>$null } catch { }
}
try { python -m mpremote connect $Port fs rm :maintenance 2>$null } catch { }
python -m mpremote connect $Port reset
