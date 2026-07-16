# Semana 3 — VPS, Doppler e Infraestrutura

## Contexto

Nesta semana configuramos a infraestrutura de deploy na VPS Hostgator com
Ubuntu 22.04, instalamos as dependências necessárias, conectamos o Doppler
para gerenciamento de secrets e blindamos o acesso SSH.

---

## Decisao de infraestrutura

| | Hostgator NVME 4 | Hostinger KVM 2 |
|---|---|---|
| vCPU | 2 | 2 |
| RAM | 4GB | 8GB |
| Armazenamento | 100GB | 100GB |
| Contrato | 1 ano | 2 anos |
| Preco/mes | R$43,89 | R$43,88 |
| Latencia | 15ms Brasil ✅ | 150ms Boston ❌ |

**Escolha: Hostgator NVME 4** — servidor no Brasil, latencia excelente.

**Sistema operacional: Ubuntu 22.04 LTS**

---

## 1. Conectar na VPS via SSH

```bash
ssh root@IP-DA-VPS -p 22022
```

---

## 2. Atualizar o servidor

```bash
apt update && apt upgrade -y
```

---

## 3. Instalar Node.js via NVM

```bash
# Instala NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Recarrega o terminal
source ~/.bashrc

# Instala Node.js LTS
nvm install --lts
nvm use --lts

# Atualiza npm
npm install -g npm@latest

# Verifica
node --version
npm --version
```

---

## 4. Instalar PM2

```bash
npm install -g pm2
pm2 --version
```

---

## 5. Instalar Nginx

```bash
apt install nginx -y
nginx -v
```

---

## 6. Instalar Git

```bash
apt install git -y
git --version
```

---

## 7. Configurar chave SSH para o GitHub

```bash
# Gera a chave
ssh-keygen -t ed25519 -C "vps-saas-scaffolding" -f ~/.ssh/id_ed25519

# Exibe a chave publica
cat ~/.ssh/id_ed25519.pub
```

Cadastra a chave no GitHub:
**Settings → SSH and GPG keys → New SSH key**
- Title: `vps-saas-scaffolding`
- Key: cola a chave copiada

Testa a conexao:

```bash
ssh -T git@github.com
```

---

## 8. Clonar o repositorio

```bash
cd /var/www
git clone git@github.com:SEU-USUARIO/saas_scaffolding.git
cd saas_scaffolding
```

---

## 9. Instalar dependencias do projeto

```bash
# Dependencias raiz do monorepo
npm install

# Dependencias do backend
cd packages/backend
npm install
```

---

## 10. Instalar o Doppler

```bash
curl -Ls https://cli.doppler.com/install.sh | sh
doppler --version
```

---

## 11. Configurar o Doppler

### No painel do Doppler
1. Cria o projeto `saas-scaffolding`
2. Entra em **prod**
3. Cadastra as secrets:
   - `DATABASE_URL` — string de conexao do migration_user
   - `DATABASE_URL_APP` — string de conexao do app_user
4. Em **Access** gera um Service Token com permissao **read only**
   - Nome: `vps-hostgator`

### Na VPS
```bash
# Configura o token
doppler configure set token SEU-TOKEN-AQUI

# Configura o projeto e ambiente
doppler configure set project saas-scaffolding
doppler configure set config prd

# Verifica as secrets
doppler secrets
```

> ⚠️ O comando `doppler secrets` exibe os valores — use apenas para verificacao.
> A aplicacao acessa via `doppler run -- node dist/index.js` sem expor em arquivo.

---

## 12. Configurar Nginx como proxy reverso

```bash
nano /etc/nginx/sites-available/saas-scaffolding
```

Conteudo do arquivo:

```nginx
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Ativa a configuracao:

```bash
# Ativa o site
ln -s /etc/nginx/sites-available/saas-scaffolding /etc/nginx/sites-enabled/

# Remove o site padrao
rm /etc/nginx/sites-enabled/default

# Verifica a configuracao
nginx -t

# Reinicia o Nginx
systemctl restart nginx
systemctl status nginx
```

---

## 13. Configurar PM2 para iniciar com a VPS

```bash
pm2 startup
systemctl enable pm2-root
```

---

## 14. Blindar acesso SSH

### Cria usuario deploy
```bash
# Cria o usuario
adduser deploy

# Adiciona ao grupo sudo
usermod -aG sudo deploy

# Verifica
groups deploy
```

### Copia chave SSH do Mac para o deploy
No terminal do Mac:

```bash
ssh-copy-id -p 22022 deploy@IP-DA-VPS
```

Testa a conexao antes de desabilitar o root:

```bash
ssh -p 22022 deploy@IP-DA-VPS
```

### Desabilita login root via SSH
Na VPS como root:

```bash
nano /etc/ssh/sshd_config
```

Altera:
```
PermitRootLogin yes  →  PermitRootLogin no
```

Reinicia o SSH:

```bash
systemctl restart sshd
```

Confirma que root esta bloqueado — no Mac:

```bash
ssh -p 22022 root@IP-DA-VPS
# Deve retornar: Permission denied
```

---

## 15. Como acessar root depois

```bash
# Conecta como deploy
ssh -p 22022 deploy@IP-DA-VPS

# Escala para root quando necessario
sudo su -
```

---

## Stack da VPS

| Ferramenta | Versao |
|---|---|
| Ubuntu | 22.04 LTS |
| Node.js | v24.15.0 |
| npm | 11.14.1 |
| PM2 | 7.0.1 |
| Nginx | 1.18.0 |
| Git | 2.34.1 |
| Doppler | 3.76.0 |

---

## Checklist Semana 3

- [x] VPS Hostgator provisionada — Ubuntu 22.04
- [x] Node.js, npm, PM2, Nginx e Git instalados
- [x] Chave SSH configurada para o GitHub
- [x] Repositorio clonado na VPS
- [x] Dependencias do projeto instaladas
- [x] Doppler instalado e conectado com os secrets
- [x] Nginx configurado como proxy reverso
- [x] PM2 configurado para iniciar com a VPS
- [x] Usuario deploy criado com acesso sudo
- [x] Login root via SSH desabilitado
- [ ] Upstash Redis — semana 4
