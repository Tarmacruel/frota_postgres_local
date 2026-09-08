# FrotaSigner-HML

Agente Windows portátil para a homologação da assinatura ICP-Brasil. Ele atende somente em
`127.0.0.1:54174`, aceita a origem `http://127.0.0.1:3010` e conversa apenas com o backend
`http://127.0.0.1:8010`.

O agente lê certificados A1 do Windows Certificate Store, abre PFX/P12 com chave efêmera e
usa chaves A3 expostas pelos provedores CSP/CNG instalados. PFX, senha, PIN e chave privada
nunca fazem parte das requisições.

## Build local

```powershell
& 'D:\FROTAS\.toolchains\dotnet\dotnet.exe' build .\FrotaSigner.Hml\FrotaSigner.Hml.csproj
```

## Publicação portátil

```powershell
.\publish.ps1
```

Em um release apto à promoção, execute com `-RequireAuthenticode`; a publicação falhará se o
executável não estiver assinado por um certificado Authenticode confiável.
