#!/bin/bash
# 初始化 PostgreSQL 中文全文检索配置（zhparser）
# 在 docker-entrypoint-initdb.d 中于数据库创建后执行。
set -e

: "${POSTGRES_DB:=postgres}"
: "${POSTGRES_USER:=postgres}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-'EOSQL'
CREATE EXTENSION IF NOT EXISTS zhparser;
CREATE TEXT SEARCH CONFIGURATION IF NOT EXISTS zh (PARSER = zhparser);
ALTER TEXT SEARCH CONFIGURATION zh
  ADD MAPPING FOR n,v,a,i,e,l,j,o,c,u,t,s,p,m,q WITH simple;
EOSQL

echo "zhparser 文本检索配置初始化完成。"
