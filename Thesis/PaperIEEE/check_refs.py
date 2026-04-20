import urllib.request
import json
import urllib.parse
titles = [
    'Recent Advances in Indoor Localization: A Survey on Theoretical Approaches and Applications',
    'BLE Beacons for Indoor Positioning at an Interactive IoT-Based Smart Museum',
    'Wi-Fi Fingerprint-Based Indoor Positioning: Recent Advances and Comparisons',
    'Two-Step XGBoost Model for Indoor Localization Using RSSI',
    'Comparative Analysis of Machine Learning Algorithms for BLE RSSI-Based Indoor Localization',
    'Bluetooth-Based Indoor Positioning Through Angle of Arrival Estimation: Body Shadowing Compensation and Performance Analysis',
    'Time-LLM: Time Series Forecasting by Reprogramming Large Language Models',
    'Large Language Models Are Zero-Shot Time Series Forecasters',
    'Location Fingerprinting with Bluetooth Low Energy Beacons',
    'Nearest Neighbor Pattern Classification',
    'XGBoost: A Scalable Tree Boosting System',
    'One Fits All: Power General Time Series Analysis by Pretrained LM',
    'Chain-of-Thought Prompting Elicits Reasoning in Large Language Models',
    "Analysis of WLAN's Received Signal Strength Indication for Indoor Location Fingerprinting"
]

for title in titles:
    url = 'https://api.crossref.org/works?query.title=' + urllib.parse.quote(title) + '&select=title,author,DOI,container-title,published&rows=1'
    req = urllib.request.Request(url, headers={'User-Agent': 'mailto:test@example.com'})
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())
            items = data['message']['items']
            if items:
                item = items[0]
                pub = item.get('published', {}).get('date-parts', [['']])[0][0]
                venue = item.get('container-title', [''])[0] if isinstance(item.get('container-title'), list) else item.get('container-title', '')
                matched_title = item.get('title', [''])[0]
                print(f"FOUND: {title}")
                print(f"  Matches: {matched_title} | Year: {pub} | Venue: {venue}")
            else:
                print(f"NOT FOUND: {title}")
    except Exception as e:
        print(f"ERROR on {title}: {e}")
