# Core Gateway TLS certificates

Place the production certificate files for `joppenheim.org` here:

- `fullchain.pem`
- `privkey.pem`

The gateway reads these inside the container as:

- `/app/content/certs/fullchain.pem`
- `/app/content/certs/privkey.pem`

When both files exist, `core-gateway` starts an HTTPS listener on container port `3443`, which is mapped to host port `443` by `compose.yaml`.

Example deploy copy from a Let's Encrypt install on the Docker host:

```bash
sudo cp /etc/letsencrypt/live/joppenheim.org/fullchain.pem ./Volumes/Core-Gateway/certs/fullchain.pem
sudo cp /etc/letsencrypt/live/joppenheim.org/privkey.pem ./Volumes/Core-Gateway/certs/privkey.pem
sudo chown "$USER":"$USER" ./Volumes/Core-Gateway/certs/fullchain.pem ./Volumes/Core-Gateway/certs/privkey.pem
docker compose up -d --build core-gateway
```

For renewal, use Certbot's `--deploy-hook` to copy the renewed files and restart `core-gateway` after a successful renewal.
