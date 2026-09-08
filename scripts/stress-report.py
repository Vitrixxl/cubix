"""Render recorded load-test results. No server or network access."""
import csv
import json
import sys
from pathlib import Path

out = Path(sys.argv[1]).resolve()
r = json.loads((out / 'results.json').read_text())
stages = [s for s in r['results'] if 'requests' in s]
if 'cooldown' not in r:
    raise SystemExit('Run still in progress; final cooldown measurement is missing.')

def number(n, decimals=0):
    return f'{n:,.{decimals}f}'.replace(',', ' ').replace('.', ',')

fields = ['users', 'connected', 'activeUsers', 'connectionFailures', 'concurrency', 'requests', 'rps',
          'p50', 'p95', 'p99', 'failedRequests', 'errorPercent', 'rssPeakMB', 'rssEndMB',
          'cpuMean', 'cpuPeak', 'fdPeak', 'wsClosed', 'generatorRssMB', 'generatorLagP99']
with (out / 'summary.csv').open('w') as f:
    writer = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
    writer.writeheader()
    writer.writerows(stages)
total = sum(s['requests'] for s in stages)
errors = sum(s['failedRequests'] for s in stages)
peak = max(max(s['rssMB'], s['peakMB']) for s in r['samples'])
max_connections = max(s['connected'] for s in r['results'])
lines = [f"# Stress test {r.get('backend', 'Rust')} — {r['timestamp'][:10]}", '',
         f"**{number(max_connections)} connexions établies au maximum**, {number(total)} requêtes, "
         f"{number(errors)} échecs ({number(errors / total * 100, 2)} %). Pic RSS serveur : **{number(peak, 1)} Mo**.", '',
         '| Connexions | Utilisateurs HTTP actifs | HTTP simultanées | Requêtes/s | p50 ms | p95 ms | p99 ms | Échecs | Pic RAM Mo | CPU moyen¹ |',
         '|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
for s in stages:
    lines.append(f"| {number(s['connected'])} | {number(s['activeUsers']) if 'activeUsers' in s else '—'} | "
                 f"{number(s['concurrency'])} | {number(s['rps'])} | {number(s['p50'], 1)} | {number(s['p95'], 1)} | "
                 f"{number(s['p99'], 1)} | {number(s['failedRequests'])} ({number(s['errorPercent'], 2)} %) | "
                 f"{number(s['rssPeakMB'], 1)} | {number(s['cpuMean'], 1)} % |")
lines += ['', '¹ 100 % CPU = un cœur logique occupé. Le p95 signifie que 95 % des requêtes terminent dans ce délai. '
          'Mo = 1 000 000 octets. Les latences incluent les échecs et les timeouts.', '',
          '## Mémoire et volume', '',
          f"- RSS initiale : {number(r['baseline']['rssMB'], 1)} Mo ; pic : {number(peak, 1)} Mo ; "
          f"30 secondes après fermeture des WebSockets : {number(r['cooldown']['rssMB'], 1)} Mo.",
          f"- Swap serveur maximal : {number(max(s['swapMB'] for s in r['samples']), 1)} Mo.",
          f"- Descripteurs ouverts au pic : {number(max(s['openFds'] for s in r['samples']))} / {number(r['host']['fdHardLimit'])}.",
          f"- WebSockets fermées pendant les paliers HTTP : {number(sum(s['wsClosed'] for s in stages))}.",
          f"- Notifications reçues : {number(sum(s['notifications'] for s in stages))} ; réponses aux heartbeats : {number(sum(s['pongs'] for s in stages))}.",
          f"- RAM des générateurs clients au plus haut relevé de fin de palier : {number(max(s['generatorRssMB'] for s in stages), 1)} Mo (processus distincts du serveur).",
          f"- Retard p99 maximal des boucles événementielles des générateurs : {number(max(s['generatorLagP99'] for s in stages), 1)} ms.",
          f"- Durée mesurée après préparation de la base : {number(r['totalElapsedSeconds'], 1)} secondes.",
          f"- Base : {number(r['setup']['registeredUsers'])} comptes, {number(r['setup']['initialSolves'])} temps initiaux, "
          f"{number(r['counts']['solves'] - r['setup']['initialSolves'])} temps ajoutés et {number(r['counts']['messages'])} messages synthétiques."]
for s in r['results']:
    if s.get('connectionFailures') or s.get('limit'):
        lines.append(f"- Palier {number(s['users'])} visé : {number(s['connected'])} connexions établies, "
                     f"{number(s.get('connectionFailures', 0))} nouveaux échecs d’ouverture" +
                     (' ; charge HTTP non lancée.' if s.get('limit') else '.'))
routes = {}
statuses = {}
transport = {}
for s in stages:
    for route, v in s['routes'].items():
        counts = routes.setdefault(route, [0, 0])
        counts[0] += v['count']; counts[1] += v['errors']
    for status, count in s['statuses'].items():
        statuses[status] = statuses.get(status, 0) + count
    for worker in s.get('transportErrors', []):
        for error, count in worker.items():
            transport[error] = transport.get(error, 0) + count
assert sum(v[0] for v in routes.values()) == total
if errors == 0:
    assert r['counts']['solves'] - r['setup']['initialSolves'] == routes['POST /solves'][0]
    assert r['counts']['messages'] == routes['POST /social/messages/:peer'][0]
lines += ['', '## Routes et erreurs', '', '| Route | Requêtes | Échecs |', '|---|---:|---:|']
for route, (count, failed) in sorted(routes.items()):
    lines.append(f'| `{route}` | {number(count)} | {number(failed)} |')
lines += ['', f"Statuts : `{json.dumps(statuses, sort_keys=True)}`.",
          f"Erreurs de transport : `{json.dumps(transport, sort_keys=True)}`.", '',
          '## Protocole et limites', '',
          f"- Serveur : {r['runtime']} ; générateurs : {r.get('generatorRuntime', 'Node.js')}. "
          f"{r['setup']['workerProcesses']} processus clients, paliers de {r['setup']['phaseSeconds']} secondes.",
          '- Intel Core Ultra 7 255HX, 20 cœurs logiques et environ 30,75 Gio de RAM. Serveur et générateurs sur la même machine.',
          '- Mode production, base SQLite temporaire et comptes fictifs. Chaque utilisateur garde une WebSocket authentifiée et envoie un heartbeat toutes les 15 secondes.',
          '- Charge continue sans temps de réflexion : 20 % lecture des temps, 15 % statistiques, 15 % profils, 15 % écriture de temps, 10 % amis, 10 % lecture des messages, 5 % envoi de messages, 5 % recherche et 5 % identité. Les messages trop rapprochés pour un utilisateur sont remplacés par une lecture de son identité.',
          '- Tokens préparés puis vérifiés par l’API. Les vagues de mots de passe/inscriptions, les assets et le rendu navigateur sont exclus. Les écritures sont réellement vérifiées dans SQLite.',
          '- La concurrence HTTP est distincte du nombre de sockets connectées. Le débit est calculé sur la durée complète, y compris les dernières requêtes en cours. Un échec inclut les réponses non-200/201 et les timeouts ; aucune requête n’est retentée.',
          '- Les requêtes continuent à être produites en boucle pendant tout le palier. Les historiques grossissent et les nouveaux comptes entrent avec leur historique initial : le jeu de données ne reste pas identique entre paliers.',
          '- Mesures /proc toutes les 500 ms : RSS, pic historique, CPU, swap et descripteurs. La RAM des clients et le cache disque du système ne sont pas comptés dans la RSS du serveur.',
          '- La mémoire résiduelle peut inclure des allocations retenues et des connexions HTTP keep-alive. Ce test court ne prouve ni une fuite ni son absence à long terme.',
          '- Un timeout client ne prouve pas l’annulation d’une écriture déjà exécutée. Les volumes en base peuvent alors dépasser les réponses de succès reçues.',
          '- Ce maximum est celui testé dans ce scénario. Un grand nombre de sockets ouvertes ne garantit pas une latence acceptable sous une charge arbitraire.']
if r['host']['fdHardLimit'] > 4096:
    lines += ['', 'Le test renforcé utilise un conteneur sans réseau externe, sans ports publiés, limité à 8 Gio de RAM '
              'et 16 cœurs CPU, avec 262 144 descripteurs par processus. Huit ports loopback alimentent le même processus Rust '
              'pour éviter l’épuisement des ports TCP clients. '
              'Les timeouts HTTP n’interrompent pas la montée ; les échecs massifs de connexion/déconnexion ou le seuil RSS serveur de 4 000 Mo l’arrêtent.']
lines += ['', 'Fichiers : `results.json`, `summary.csv`, `memory.csv`, `run.log`, `server.log`.', '']
(out / 'REPORT.md').write_text('\n'.join(lines))
print(json.dumps({'maxConnections':max_connections,'requests':total,'errors':errors,'rssPeakMB':peak,'cooldownMB':r['cooldown']['rssMB']},indent=2))
