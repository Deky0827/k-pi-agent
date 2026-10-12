!macro customInstall
  ClearErrors
  ExecWait '"$SYSDIR\compact.exe" /C /S:"$INSTDIR\resources\seed" /I /Q /EXE:XPRESS16K' $0
!macroend
