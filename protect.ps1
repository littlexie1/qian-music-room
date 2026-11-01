param([ValidateSet('read','write')][string]$Action,[ValidateSet('netease','dashscope','session')][string]$Name='netease')
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$secretFile=Join-Path $PSScriptRoot ('private\'+$Name+'.xml')
if($Action -eq 'write'){
 $null=New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot 'private') -Force
 $secretValue=[Console]::In.ReadToEnd()
 ConvertTo-SecureString -String $secretValue -AsPlainText -Force | Export-Clixml -LiteralPath $secretFile
}elseif(Test-Path -LiteralPath $secretFile){
 [Console]::Write([System.Net.NetworkCredential]::new('',(Import-Clixml -LiteralPath $secretFile)).Password)
}
