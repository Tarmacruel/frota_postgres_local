"""Installed in the control folder: always run the versioned HML implementation."""
from pathlib import Path
import runpy

source = Path(r'D:\FROTAS\frota_emprestimos_testes\scripts\homologation\refresh_data.py')
if source.resolve() != source or not source.is_file():
    raise RuntimeError('The versioned homologation refresh entrypoint is unavailable.')
runpy.run_path(str(source), run_name='__main__')
