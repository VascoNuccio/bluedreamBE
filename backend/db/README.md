# modificare il db online

da questa cartella lanciare i seguenti comandi dopo aver aggiornato il file schema.prisma

### importante
Non modificare i file SQL delle migrazioni già applicate.
    Se vuoi cambiare lo schema, crea una nuova migrazione con npx prisma migrate dev --name nome_migrazione

### comandi

// crea una commit con le modifiche
npx prisma migrate dev --name rename_depth_to_deep

// pusha le modifiche(questo cancellerà eventuali dati e relazioni per crearne di nuovi)
npx prisma migrate deploy

// aggiorna il PrismaClient per far funzionare correttamente le connessioni tra be e db
npx prisma generate
