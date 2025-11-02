bind = "0.0.0.0:8000"
workers = 2          # bump to 2–4 on bigger dynos
threads = 4
timeout = 120
graceful_timeout = 30
loglevel = "info"
accesslog = "-"      # stdout
errorlog  = "-"
