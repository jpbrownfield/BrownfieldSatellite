import urllib.request, urllib.parse, re

try:
    url = 'https://www.bing.com/images/search?q=' + urllib.parse.quote('matrix movie cover art')
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36'})
    response = urllib.request.urlopen(req, timeout=5)
    html = response.read().decode('utf-8', errors='ignore')
    
    urls = re.findall(r'murl&quot;:&quot;([^&]+)&quot;', html)
    print(urls[:5])
except Exception as e:
    print(f"Error: {e}")