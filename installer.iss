[Setup]
AppName=Brownfield Satellite
AppVersion=1.0.0
DefaultDirName={pf}\Brownfield Satellite
DefaultGroupName=Brownfield Satellite
OutputDir=release\installer
OutputBaseFilename=BrownfieldSatelliteSetup
Compression=lzma
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; IMPORTANT: Update the Source path to point to the exact directory that nw-builder outputs
; For example: release\Brownfield\win32\* or wherever Brownfield.exe ends up.
Source: "release\Brownfield\win-x64\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "release\Brownfield\win-x64\agent.exe"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Brownfield Satellite"; Filename: "{app}\Brownfield.exe"
Name: "{commondesktop}\Brownfield Satellite"; Filename: "{app}\Brownfield.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\Brownfield.exe"; Description: "{cm:LaunchProgram,Brownfield Satellite}"; Flags: nowait postinstall skipifsilent
