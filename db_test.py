import psycopg2

conn = psycopg2.connect(
    host="localhost",
    port=5432,
    user="postgres",
    password="root",
    dbname="postgres"
)
print("✅ Connected")
conn.close()
