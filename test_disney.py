
import urllib.request, json
res = urllib.request.urlopen('https://api.themoviedb.org/3/tv/84958/watch/providers?api_key=94e10934d3c360799a710618b1e5406f')
data = json.loads(res.read())
print(json.dumps(data.get('results', {}), indent=2))

