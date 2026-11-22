; KuroRelay Windows Installer Script (Inno Setup)
; Version is dynamically passed via /DMyAppVersion from build_installer.py

#ifndef MyAppVersion
#define MyAppVersion "0.1.0"
#endif

#define MyAppName "KuroRelay"
#define MyAppShortName "KuroRelay"
#define MyAppPublisher "KuroLabs"
#define MyAppURL "https://github.com/Kuro-Labs/KuroRelay"
#define MyAppExeName "KuroRelay.exe"

[Setup]
; Unique application GUID for KuroRelay
AppId={{4D6F9C21-6A8E-45E2-9E11-3A4B8C7D2E01}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes

; Visual Branding & Wizard Assets
SetupIconFile=..\assets\icons\app.ico
WizardImageFile=..\dist\installer-assets\kurorelay-wizard.bmp
WizardSmallImageFile=..\dist\installer-assets\kurorelay-wizard-small.bmp
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName} {#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
OutputDir=..\dist\installer
OutputBaseFilename=KuroRelay-Setup-v{#MyAppVersion}-x64

; 64-bit Windows Architecture Optimization
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DisableProgramGroupPage=yes
CloseApplications=yes
CloseApplicationsFilter={#MyAppExeName}
RestartApplications=yes

; Version Resource Metadata
VersionInfoVersion={#MyAppVersion}.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=KuroRelay Professional Installer
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}
VersionInfoCopyright=Copyright (C) 2026 KuroLabs. All rights reserved.

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Types]
Name: "standard"; Description: "Standard (recommended — faster startup)"; Flags: iscustom
Name: "portable"; Description: "Single executable (portable standalone file)"

[Components]
Name: "mode_folder";  Description: "Install modular application folder (fastest startup)"; Types: standard; Flags: exclusive
Name: "mode_onefile"; Description: "Install single-file application executable"; Types: portable; Flags: exclusive

[Tasks]
Name: "desktopicon";   Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startmenuicon"; Description: "Create Start Menu shortcut"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
; Option 1: Modular OneFolder installation
Source: "..\dist\onefolder\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Components: mode_folder

; Option 2: Standalone OneFile executable installation
Source: "..\dist\onefile\KuroRelay.exe"; DestDir: "{app}"; DestName: "{#MyAppExeName}"; Flags: ignoreversion; Components: mode_onefile

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startmenuicon
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"; Tasks: startmenuicon
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Register application path in Windows App Paths (allows Win+R > kurorelay)
Root: HKA; Subkey: "Software\Microsoft\Windows\CurrentVersion\App Paths\{#MyAppExeName}"; ValueType: string; ValueName: ""; ValueData: "{app}\{#MyAppExeName}"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Microsoft\Windows\CurrentVersion\App Paths\{#MyAppExeName}"; ValueType: string; ValueName: "Path"; ValueData: "{app}"; Flags: uninsdeletekey

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
