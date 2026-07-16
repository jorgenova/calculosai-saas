# Configurando SSL com Let's Encrypt

## Pre-requisitos
- Dominio apontando para o IP da VPS (registro A no DNS)
- Nginx instalado e funcionando
- Porta 443 aberta no firewall

## 1. Instalar o Certbot

```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx -y
```

## 2. Atualizar o Nginx com o dominio

Edita `/etc/nginx/sites-available/saas_scaffolding` e substitui `server_name _` pelo dominio real:

```nginx
server_name meudominio.com.br www.meudominio.com.br;
```

Testa e recarrega:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 3. Gerar o certificado

```bash
sudo certbot --nginx -d meudominio.com.br -d www.meudominio.com.br
```

O Certbot vai atualizar o Nginx automaticamente com o bloco SSL.

## 4. Renovacao automatica

O Certbot instala um timer que renova o certificado automaticamente. Verifica:

```bash
sudo systemctl status certbot.timer
```

## 5. Atualizar ALLOWED_ORIGINS no Doppler

Apos configurar SSL, atualiza a variavel no ambiente `prd`:
ALLOWED_ORIGINS=https://meudominio.com.br,https://www.meudominio.com.br

## 6. Subdominio por tenant

Para suportar `empresa.meudominio.com.br`, usa wildcard no certificado:

```bash
sudo certbot --nginx -d meudominio.com.br -d *.meudominio.com.br --server https://acme-v02.api.letsencrypt.org/directory
```

> Wildcard requer validacao via DNS — configure o registro TXT no seu provedor de DNS conforme instruido pelo Certbot.