-- Run once in pgAdmin 4 (connected to the default "postgres" database):
-- Query Tool → paste → Execute (F5)

CREATE DATABASE dmhr_portal
  WITH OWNER = postgres
       ENCODING = 'UTF8'
       TEMPLATE = template0;
