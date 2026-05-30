import requests
from bs4 import BeautifulSoup

url = "https://fixupx.com/jerryjliu0/status/2060401682610262424"

html = requests.get(url).text

soup = BeautifulSoup(html, "html.parser")

title = soup.find("meta", {"property": "og:title"})
description = soup.find("meta", {"property": "og:description"})

print(title["content"])
print(description["content"])
