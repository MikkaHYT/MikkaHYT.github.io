import pychromecast
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import time
import tempfile
import os

def create_webpage_stream():
    """Create a simple HTML file that works with Chromecast"""
    
    # Create a simple HTML wrapper that might work better
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {{ 
                margin: 0; 
                padding: 0; 
                background: black;
                font-family: Arial, sans-serif;
                color: white;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
            }}
            .container {{
                text-align: center;
                max-width: 90%;
            }}
            iframe {{
                width: 100%;
                height: 80vh;
                border: none;
                background: white;
            }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Streaming: 814850.xyz/tv</h1>
            <iframe src="http://814850.xyz/tv" allowfullscreen></iframe>
        </div>
    </body>
    </html>
    """
    
    # Save to temp file
    temp_file = os.path.join(tempfile.gettempdir(), "chromecast_page.html")
    with open(temp_file, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    return f"file:///{temp_file.replace(os.sep, '/')}"

def cast_html_file():
    """Try to cast an HTML file"""
    html_url = create_webpage_stream()
    
    chromecasts = pychromecast.get_chromecasts()[0]
    if not chromecasts:
        print("No Chromecasts found.")
        return

    cast = chromecasts[0]
    print(f"Found Chromecast: {cast.name}")
    cast.wait()
    
    cast.start_app('CC1AD845')
    mc = cast.media_controller
    
    print(f"Attempting to cast: {html_url}")
    mc.play_media(html_url, 'text/html')
    mc.block_until_active()
    
    print("Check your Chromecast...")

if __name__ == "__main__":
    cast_html_file()