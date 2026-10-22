import os,subprocess,time
# Use only a disposable database initialized with tests/sql/schema.sql.
PSQL=[os.environ.get('PSQL', 'psql'),'-X','-v','ON_ERROR_STOP=1','-At']
def sql(q): return subprocess.run(PSQL,input=q,text=True,capture_output=True)
r=sql("INSERT INTO \"Product\"(id,name,stock) VALUES ('race-concurrency','Race',1);")
assert r.returncode==0,r.stderr
first=subprocess.Popen(PSQL,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
first.stdin.write("BEGIN; INSERT INTO \"Order\"(id,\"productId\",quantity) VALUES ('race-concurrency-a','race-concurrency',1); SELECT pg_sleep(1); COMMIT;");first.stdin.close()
time.sleep(.2)
second=sql("INSERT INTO \"Order\"(id,\"productId\",quantity) VALUES ('race-concurrency-b','race-concurrency',1);")
first.wait(timeout=5)
assert first.returncode==0
assert second.returncode!=0 and 'JUANI_STOCK_INSUFFICIENT' in second.stderr,second.stderr
r=sql("SELECT stock,(SELECT count(*) FROM \"Order\" WHERE \"productId\"='race-concurrency') FROM \"Product\" WHERE id='race-concurrency';")
assert r.stdout.strip()=='0|1',r.stdout
print('PASS: two concurrent buyers, one pack: one accepted, one rejected, stock 0.')
