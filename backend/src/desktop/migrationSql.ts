// Split only top-level SQL; quoted strings, function bodies and comments may contain semicolons.
export function migrationStatements(sql:string):string[]{
  const statements:string[]=[];let current='',quote='',dollar='',comment=0,line=false;
  for(let i=0;i<sql.length;i++){
    const c=sql[i],next=sql[i+1];
    if(line){if(c==='\n'){line=false;current+='\n';}continue;}
    if(comment){if(c==='/'&&next==='*'){comment++;i++;}else if(c==='*'&&next==='/'){comment--;i++;if(!comment)current+=' ';}continue;}
    if(dollar){if(sql.startsWith(dollar,i)){current+=dollar;i+=dollar.length-1;dollar='';}else current+=c;continue;}
    if(quote){current+=c;if(c==='\\'&&quote==="'"){current+=next||'';i++;}else if(c===quote){if(next===quote){current+=next;i++;}else quote='';}continue;}
    if(c==='-'&&next==='-'){line=true;i++;continue;}
    if(c==='/'&&next==='*'){comment=1;i++;continue;}
    if(c==='"'||c==="'"){quote=c;current+=c;continue;}
    if(c==='$'){const tag=sql.slice(i).match(/^\$(?:[a-zA-Z_][a-zA-Z0-9_]*)?\$/)?.[0];if(tag){dollar=tag;current+=tag;i+=tag.length-1;continue;}}
    if(c===';'){if(current.trim())statements.push(current.trim());current='';}else current+=c;
  }
  if(quote||dollar||comment)throw new Error('El SQL tiene una cadena, función o comentario sin cerrar.');
  if(current.trim())statements.push(current.trim());
  if(/^BEGIN(?:\s+(?:WORK|TRANSACTION))?$/i.test(statements[0]||'')){
    if(!/^(?:COMMIT|END)(?:\s+(?:WORK|TRANSACTION))?$/i.test(statements.at(-1)||''))throw new Error('La transacción del archivo no termina con COMMIT.');
    statements.shift();statements.pop();
  }
  if(!statements.length)throw new Error('El archivo no contiene sentencias SQL.');
  for(const statement of statements){
    if(/^(?:BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE|PREPARE\s+TRANSACTION|VACUUM|CREATE\s+DATABASE|DROP\s+DATABASE|ALTER\s+SYSTEM)\b/i.test(statement) || /^(?:CREATE|DROP|REINDEX)\s+[\s\S]*?\bCONCURRENTLY\b/i.test(statement))throw new Error('Esta migración requiere ejecución especial fuera de una transacción.');
  }
  return statements;
}

// One HTTPS request owns the complete transaction; separate HTTP calls cannot share BEGIN/COMMIT.
export function atomicMigrationSql(file:string,sha:string,sql:string,dryRun:boolean):string {
  if(!/^v\d+_[-a-zA-Z0-9_]+\.sql$/.test(file)||!/^[a-f0-9]{64}$/.test(sha))throw new Error('Identidad de migración inválida.');
  const literal=(text:string)=>"'"+text.replace(/'/g,"''")+"'";
  const version=Number(file.match(/^v(\d+)/)![1]),tag='$jarvis_'+sha.slice(0,16)+'$';
  return `BEGIN;
SET LOCAL statement_timeout='60s'; SET LOCAL lock_timeout='8s'; SET LOCAL standard_conforming_strings=on;
SELECT pg_advisory_xact_lock(hashtext('jarvis-schema-migrations'));
CREATE SCHEMA IF NOT EXISTS jarvis_admin; REVOKE ALL ON SCHEMA jarvis_admin FROM PUBLIC;
CREATE TABLE IF NOT EXISTS jarvis_admin.schema_migrations (version integer PRIMARY KEY, file text NOT NULL, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()); REVOKE ALL ON jarvis_admin.schema_migrations FROM PUBLIC;
DO ${tag}
DECLARE stored text;
BEGIN
SELECT checksum INTO stored FROM jarvis_admin.schema_migrations WHERE version=${version};
IF stored IS NOT NULL AND stored<>${literal(sha)} THEN RAISE EXCEPTION 'Esta versión ya fue aplicada con otro contenido'; END IF;
IF stored IS NULL THEN
${migrationStatements(sql).map(statement=>'EXECUTE '+literal(statement)+';').join('\n')}
${dryRun?'':`INSERT INTO jarvis_admin.schema_migrations (version,file,checksum) VALUES (${version},${literal(file)},${literal(sha)});`}
END IF;
END;
${tag};
${dryRun?'ROLLBACK':'COMMIT'};`;
}
