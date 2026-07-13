# Dependência PDF da Fase 5

## ReportLab 5.0.0

- uso: geração do Termo de Posse e Responsabilidade exclusivamente no backend, em memória;
- versão fixada: `reportlab==5.0.0` em `backend/requirements.txt`;
- licença: BSD, conforme os metadados oficiais do projeto e a documentação do fornecedor;
- compatibilidade declarada: Python `>=3.9,<4`, incluindo Python 3.12 usado neste ambiente;
- compatibilidade Windows: distribuição `py3-none-any.whl`, sem artefato específico de sistema operacional; instalação e geração de PDF validadas no Windows deste projeto;
- armazenamento: o binário não é persistido e não é incluído na auditoria;
- dependência transitiva observada: Pillow já presente no ambiente.

Fontes verificadas em 2026-07-13:

- https://pypi.org/project/reportlab/5.0.0/
- https://docs.reportlab.com/developerfaqs/

