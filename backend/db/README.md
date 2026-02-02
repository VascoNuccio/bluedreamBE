# modificare il db online

da questa cartella lanciare i seguenti comandi dopo aver aggiornato il file schema.prisma

### importante
Non modificare i file SQL delle migrazioni già applicate.
    Se vuoi cambiare lo schema, crea una nuova migrazione con npx prisma migrate dev --name nome_migrazione

ricrea le migration partendo da 0
rm -rf prisma/migrations
npx prisma migrate dev --name init

crea un reset del db totale
Non ti interessa la storia, solo lo schema attuale, ripartire da 0 con soluzione pulita
    npx prisma migrate reset

### comandi

// crea una commit con le modifiche
npx prisma migrate dev --name nome_nuovo_commit

// pusha le modifiche(questo cancellerà eventuali dati e relazioni per crearne di nuovi)
npx prisma migrate deploy

// aggiorna il PrismaClient per far funzionare correttamente le connessioni tra be e db
npx prisma generate
