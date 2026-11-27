# Auditoria de acessos do Frotas

Na página **Auditoria administrativa**, use **Acessos** para ver entradas autorizadas, tentativas recusadas, tentativas bloqueadas e saídas solicitadas com sessão válida. A tela permite filtrar por período e buscar por conta, IP e ID de auditoria da sessão.

Os eventos de acesso e o minimapa são exclusivos do perfil Superusuário. Tentativas sem autenticação mostram o identificador informado como identidade não verificada. Entradas bem-sucedidas recebem um ID aleatório de auditoria que também aparece nas operações auditadas e na saída da mesma sessão. Esse ID é um identificador de correlação. Senhas, cookies e tokens de acesso ficam fora do registro.

O backend registra os resultados das requisições que chegam ao fluxo de autenticação. Requisições descartadas pelo limite bruto de requisições por IP, expiração silenciosa e fechamento de abas ficam fora desse fluxo. As datas da tela e dos filtros seguem o horário da Bahia. O cabeçalho `CF-Ray`, quando recebido em formato válido, fica disponível para cruzar a requisição com os registros do Cloudflare.

## Homologação

1. Instale as dependências de `backend/requirements.txt` e compile o frontend com `npm run build`. A trilha reutiliza a tabela `audit_logs`.
2. Baixe a versão mensal **IP to City Lite (MMDB)** do [DB-IP](https://db-ip.com/db/lite.php) e extraia o `.mmdb.gz` no servidor. Use `AUDIT_IP_CITY_MMDB` no ambiente do backend para indicar o caminho do arquivo extraído. O caminho padrão é `<STORAGE_DIR>/geoip/dbip-city-lite.mmdb`.
3. Reinicie o backend de homologação e publique o frontend nesse mesmo ambiente. Faça um login autorizado, uma tentativa com senha inválida e uma saída. Confira os três eventos e a correlação de sessão entre entrada e saída.
4. Abra **Detalhes do acesso** em um evento com IP público. A consulta usa apenas a base local. Se o IP tiver coordenadas, o minimapa é desenhado com os dados cartográficos locais do [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/).
5. Confirme que um administrador com escopo de secretaria não consegue consultar os eventos de acesso ou o endpoint do minimapa.

A base do DB-IP é mensal e a tela exibe a data da base consultada. O ponto no mapa representa a localização aproximada da rede associada ao IP. A base pode não cobrir um endereço ou conter apenas o nome da localidade. Em eventos antigos com IP registrado, a consulta continua disponível usando a base instalada no momento da abertura.
