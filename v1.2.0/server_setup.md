- Setup ubuntu on your windows host (skip if already on linux) : https://ubuntu.com/tutorials/ubuntu-on-windows
- Install go : https://www.tecmint.com/install-go-in-ubuntu/
- Follow this  - install a BSC full node : https://docs.binance.org/smart-chain/developer/fullnode.html
  - `sudo apt-get update`
  - `git clone https://github.com/binance-chain/bsc`
  - `cd bsc`
  - `sudo apt install gcc & make & unzip`
  - `make geth`
    - If error go.sum, run `go clean -modcache & rm go.sum` and `go mod tidy`
```
## mainet
wget https://github.com/binance-chain/bsc/releases/download/v1.1.0-beta/mainnet.zip
unzip mainnet.zip

## testnet
wget https://github.com/binance-chain/bsc/releases/download/v1.1.0-beta/testnet.zip
unzip testnet.zip
```

  - For the line `./build/bin/geth --datadir node init genesis.json`
    - `screen -S geth /bin/bash` will launch a screen instance, in that case the geth node will not be terminated if you quit the terminal
    - `./build/bin/geth --syncmode=fast --config ./config.toml --datadir ./node --metrics --cache 32000 -verbosity 5 --ws --rpc.allow-unprotected-txs --txlookuplimit 0 --pprof.addr 0.0.0.0 --ws.origins "*" --ws.addr 0.0.0.0`
      - It should start your node, monitor with other ubuntu terminal with : `tail -f ./bsc/node/bsc.log`
    - Take 1-2 days to full sync, make sure your computer never sleeps / stops OR use `screen` to launch the geth node in     background
- To follow the sync of your full node : `./bsc/build/bin/geth attach http://127.0.0.1:8545`
  - `eth.syncing` : if it says false your node is fully synced.
  - See current block you are on the node :`eth.blockNumber` or get number of block left to sync `eth.syncing.highestBlock - eth.syncing.currentBlock`
  - if error `lvl=warn msg="Synchronisation failed, dropping peer" peer=d3ff2bcb81f196b4 err="retrieved hash chain is invalid"`, try to go back to a previous block : `debug.setHead("value_of_previous_block")`

If you wanna delete everything : https://ethereum.stackexchange.com/questions/1897/how-to-delete-or-reset-the-blockchain-in-geth-osx + rm -rf bsc

If you have error `connection not open on send()`, the firewall might block `sudo ufw allow 8545/tcp; sudo ufw allow 8546/tcp` and the ws address is not on 0.0.0.0 (if you wanna access it from outside)

Warning : If you open those ports everyone will have access to your node.
One thing to do is to never open those ports and work directly on the machine you have your full node via ssh.

Here what I do in the first 10 minutes on a Linux Machine :

# My first 10 minutes on a linux server

```bash
# Update
sudo apt-get update
sudo apt-get upgrade -y

# Secure SSH

sudo nano /etc/ssh/sshd_config

# edit those lines :
# PermitRootLogin no 
# PasswordAuthentication no 
# save & exit;

sudo service sshd restart

# Install packages

sudo apt-get install -y curl wget nano ufw fail2ban \
    unattended-upgrades update-notifier-common \
    build-essential software-properties-common \
    python3-dev python3-pip python3-virtualenv apache2-utils

# Auto update

sudo nano /etc/apt/apt.conf.d/10periodic

# add those following lines
# APT::Periodic::Update-Package-Lists "1";  
# APT::Periodic::Download-Upgradeable-Packages "1";  
# APT::Periodic::AutocleanInterval "7";  
# APT::Periodic::Unattended-Upgrade "1";
# save & exit;

# Install docker

curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
sudo sh /tmp/get-docker.sh
sudo usermod -aG docker $USER
mkdir -p ~/docker 

# exit session to enable docker for this user

# Install docker-compose

sudo curl -L "https://github.com/docker/compose/releases/download/1.27.4/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Setup ufw

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow http
sudo ufw allow https
sudo ufw enable
```



