require('dotenv').config();
const { exec } = require('child_process');
const fs = require('fs');

const url = process.env.DATABASE_URL;
const fecha = new Date().toISOString().slice(0, 10);

const archivo = `backup_${fecha}.sql`;

const cmd = `pg_dump "${url}" > ${archivo}`;

exec(cmd, (err) => {
  if (err) {
    console.error('Error backup:', err);
    return;
  }

  console.log('✅ Backup creado:', archivo);
});
