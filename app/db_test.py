# test_mysql_conn.py
from app.db import get_conn

try:
    conn = get_conn()
    print("✅ Connected to MySQL successfully!")
    cursor = conn.cursor()
    cursor.execute("SHOW TABLES;")
    for (tbl,) in cursor.fetchall():
        print(" -", tbl)
    conn.close()
except Exception as e:
    print("❌ Connection failed:", e)
