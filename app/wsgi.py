from dotenv import load_dotenv 
load_dotenv()

from . import create_app
app = create_app()
