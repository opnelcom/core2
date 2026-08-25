# End-to-end smoke test

1. Start the stack and wait for all containers to become healthy.
2. Open `http://localhost/`.
3. Register with the address configured in `CORE_BOOTSTRAP_ADMIN_EMAIL`.
4. Copy the development activation token into Activate.
5. Log in.
6. Confirm a personal tenant exists and is selected.
7. Add another email as a tenant user.
8. Open `/admin/` and confirm counts load.
9. Open `/monitor/` and confirm service checks load.
10. Open `/erp/`, add a note and refresh it.

Useful checks:

```bash
docker compose config
docker compose ps
docker compose logs --tail=100 core-db-saas core-db-erp core-broker core-saas core-gateway
```
