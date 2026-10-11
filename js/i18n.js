// English strings are the keys; French is looked up from FR. Anything missing falls back to English.
let lang = 'en';

export const DEFAULT_CLUBS = {
  en: ['Driver', '3W', '5W', 'Hybrid', '4i', '5i', '6i', '7i', '8i', '9i', 'PW', 'GW', 'SW', 'LW', 'Putter'],
  fr: ['Driver', 'Bois 3', 'Bois 5', 'Hybride', 'Fer 4', 'Fer 5', 'Fer 6', 'Fer 7', 'Fer 8', 'Fer 9', 'PW', 'GW', 'SW', 'LW', 'Putter'],
};

export function detectLang() {
  try { return (navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en'; } catch { return 'en'; }
}

export function setLang(l) {
  lang = l === 'fr' ? 'fr' : 'en';
  try { document.documentElement.lang = lang; } catch { /* ignore */ }
}

export function t(key, vars) {
  let s = (lang === 'fr' && FR[key]) || key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  return s;
}

export const plural = (n, one, many) => t(n === 1 ? one : many);

const FR = {
  // navigation
  'Round': 'Partie', 'Courses': 'Parcours', 'History': 'Historique', 'Stats': 'Stats', 'Settings': 'Réglages',
  // lies
  'Tee': 'Départ', 'Fairway': 'Fairway', 'Rough': 'Rough', 'Bunker': 'Bunker', 'Green': 'Green', 'Other': 'Autre',
  // common
  'Hole': 'Trou', 'holes': 'trous', 'Holes': 'Trous', 'Par': 'Par', 'par': 'par', 'Hcp': 'Hcp', 'Dist': 'Dist', 'Distance': 'Distance',
  'Score': 'Score', 'Putts': 'Putts', 'putts': 'putts', 'FW': 'FW', 'GIR': 'GIR', 'Total': 'Total', 'Card': 'Carte',
  'Date': 'Date', 'Course': 'Parcours', 'Name': 'Nom', 'Note': 'Note', 'Notes': 'Notes', 'Layout': 'Forme', 'Club': 'Club', 'Avg': 'Moy.', 'Longest': 'Max', 'Shots': 'Coups',
  'Play': 'Jouer', 'Edit': 'Modifier', 'Delete': 'Supprimer', 'Cancel': 'Annuler', 'Back': 'Retour', 'Search': 'Rechercher', 'Shot': 'Coup',
  'stroke': 'coup', 'strokes': 'coups', 'putt': 'putt', 'penalty': 'pénalité', 'penalty stroke': 'coup de pénalité', 'penalty strokes': 'coups de pénalité',
  'vs par': 'vs par', 'No holes played': 'Aucun trou joué', 'courses': 'parcours', 'rounds saved': 'parties enregistrées', 'e.g.': 'ex.',
  // errors
  'Could not save': 'Enregistrement impossible', 'GPS is not available on this device': 'GPS indisponible sur cet appareil',
  'Location permission denied': 'Localisation refusée', 'Could not get a GPS position': 'Position GPS introuvable',
  // new round
  'New round': 'Nouvelle partie', 'Add a course first. You can search for it online or type it in.': "Ajoutez d'abord un parcours : cherchez-le en ligne ou saisissez-le.",
  'Go to courses': 'Aller aux parcours', 'All {n}': 'Les {n}', 'Front 9': '9 premiers', 'Back 9': '9 derniers', 'Start round': 'Commencer la partie',
  // hole view
  'Delete shot': 'Supprimer le coup',
  'No shots yet. Add the first one below. Every stroke counts, including the putt that drops.': "Aucun coup pour l'instant. Ajoutez le premier ci-dessous. Chaque coup compte, y compris le putt qui rentre.",
  'Hide layout': 'Masquer le plan', 'Hole layout': 'Plan du trou', 'Distance to green': 'Distance au green',
  'Penalty strokes': 'Coups de pénalité', 'Water, out of bounds, drop…': 'Eau, hors-limites, drop…', 'Remove penalty': 'Retirer une pénalité', 'Add penalty': 'Ajouter une pénalité',
  'Played from': 'Joué depuis', 'Club (optional)': 'Club (facultatif)', 'Distance of this shot (optional)': 'Distance de ce coup (facultatif)', 'Shot distance': 'Distance du coup',
  'GPS marked': 'GPS marqué', 'Mark GPS': 'Marquer GPS',
  "Tip: tap “Mark GPS” where you stand to hit. The previous shot's distance is then filled in for you.": "Astuce : appuyez sur « Marquer GPS » là où vous frappez. La distance du coup précédent est alors remplie pour vous.",
  'Add shot': 'Ajouter le coup', '← Previous': '← Précédent', 'Finish round →': 'Terminer la partie →', 'Next hole →': 'Trou suivant →',
  '{d} {u} to the green (±{acc} m)': '{d} {u} jusqu’au green (±{acc} m)', 'Position marked (±{acc} m)': 'Position marquée (±{acc} m)',
  // summary
  'Scorecard': 'Carte de score', 'Conditions, how it felt…': 'Conditions, impressions…', 'Finish and save round': 'Terminer et enregistrer la partie',
  'Back to the round': 'Retour à la partie', 'Discard this round': 'Abandonner cette partie',
  // courses
  'map data': 'données carte', 'Search online': 'Chercher en ligne', 'Enter manually': 'Saisir à la main',
  'No courses yet. Search for yours, or enter par and distances by hand.': 'Aucun parcours. Cherchez le vôtre ou saisissez pars et distances à la main.',
  'Map layout': 'Plan issu de la carte', 'Straight': 'Droit', 'Dogleg left': 'Dogleg gauche', 'Dogleg right': 'Dogleg droite',
  'Note (e.g. water right)': 'Note (ex. eau à droite)', 'Hole layouts': 'Plans des trous', 'New course': 'Nouveau parcours', 'Edit course': 'Modifier le parcours',
  'Course name': 'Nom du parcours', 'Town (optional)': 'Ville (facultatif)', 'Number of holes': 'Nombre de trous', 'Save course': 'Enregistrer le parcours',
  'No golf course found. Try the town name, or enter it manually.': 'Aucun golf trouvé. Essayez le nom de la ville ou saisissez-le à la main.',
  'Find a course': 'Trouver un parcours', 'Course name or town': 'Nom du golf ou ville',
  'Uses OpenStreetMap (needs internet). Holes, pars and layouts are only available where contributors mapped them, so always check the result before saving.': "Utilise OpenStreetMap (internet requis). Trous, pars et plans n'existent que là où des contributeurs les ont cartographiés : vérifiez toujours le résultat avant d'enregistrer.",
  // history
  'Round in progress': 'Partie en cours', 'No finished rounds yet. They will appear here once you finish a round.': 'Aucune partie terminée. Elles apparaîtront ici une fois terminées.',
  'No shots recorded.': 'Aucun coup enregistré.', 'Reopen': 'Rouvrir',
  // stats
  'All courses': 'Tous les parcours', 'Finish a round to see your stats.': 'Terminez une partie pour voir vos stats.',
  'Rounds': 'Parties', 'Holes played': 'Trous joués', 'Avg vs par / 18': 'Moy. vs par / 18', 'Best round': 'Meilleure partie', 'Putts / hole': 'Putts / trou',
  'Fairways hit': 'Fairways touchés', 'Greens in reg.': 'Greens en rég.', 'Penalties / round': 'Pénalités / partie', 'Shots played from': 'Coups joués depuis',
  'No shots.': 'Aucun coup.', 'Club distances': 'Distances par club', 'Enter a club and a distance on shots to build this table.': 'Indiquez un club et une distance sur vos coups pour remplir ce tableau.',
  // settings
  'Language': 'Langue', 'Units': 'Unités', 'Metres': 'Mètres', 'Yards': 'Yards', 'Clubs in my bag': 'Clubs dans mon sac', 'Clubs': 'Clubs',
  'Separate with commas. They appear as quick buttons when you add a shot.': 'Séparez par des virgules. Ils apparaissent comme boutons rapides quand vous ajoutez un coup.',
  'Backup': 'Sauvegarde', 'Everything is stored on this phone only. Export a backup now and then, especially before changing phone or clearing Safari data.': "Tout est stocké uniquement sur ce téléphone. Exportez une sauvegarde de temps en temps, surtout avant de changer de téléphone ou d'effacer les données de Safari.",
  'Export backup (JSON)': 'Exporter la sauvegarde (JSON)', 'Export holes (CSV)': 'Exporter les trous (CSV)', 'Export shots (CSV)': 'Exporter les coups (CSV)', 'Import backup': 'Importer une sauvegarde',
  'Install on iPhone': "Installer sur l'iPhone",
  'Open this page in <b>Safari</b>, tap <b>Share</b>, then <b>Add to Home Screen</b>. It then opens full screen and works offline on the course.': "Ouvrez cette page dans <b>Safari</b>, appuyez sur <b>Partager</b>, puis <b>Sur l'écran d'accueil</b>. L'app s'ouvre alors en plein écran et fonctionne hors ligne sur le parcours.",
  'Data': 'Données', 'Delete all data': 'Supprimer toutes les données',
  // actions
  'Pick a course': 'Choisissez un parcours', 'No shots were recorded. Save an empty round?': "Aucun coup n'a été enregistré. Sauvegarder une partie vide ?",
  'Round saved': 'Partie enregistrée', 'Discard this round and all its shots?': 'Abandonner cette partie et tous ses coups ?',
  'Give the course a name': 'Donnez un nom au parcours', 'Course saved': 'Parcours enregistré',
  'Delete “{name}”? Rounds already played on it are kept.': 'Supprimer « {name} » ? Les parties déjà jouées dessus sont conservées.',
  'Searching…': 'Recherche…', 'Search failed': 'Échec de la recherche', 'Check your connection.': 'Vérifiez votre connexion.',
  'Loading holes, greens and bunkers…': 'Chargement des trous, greens et bunkers…',
  'Imported {n} holes from OpenStreetMap. Check par and distances (highlighted pars were guessed from the length), then save.': 'Import de {n} trous depuis OpenStreetMap. Vérifiez pars et distances (les pars surlignés sont estimés d’après la longueur), puis enregistrez.',
  'Delete this round?': 'Supprimer cette partie ?', 'Delete ALL courses and rounds from this phone? This cannot be undone.': 'Supprimer TOUS les parcours et parties de ce téléphone ? Action irréversible.',
  'All data deleted': 'Toutes les données supprimées', 'Imported {c} courses, {r} rounds': '{c} parcours et {r} parties importés',
  'Import failed': 'Import impossible', 'Not a Fairway backup file': "Ce n'est pas une sauvegarde Fairway",
  'Storage is unavailable (private browsing?). Rounds cannot be saved.': 'Stockage indisponible (navigation privée ?). Les parties ne peuvent pas être enregistrées.',
  // GolfCourseAPI
  'Men': 'Hommes', 'Women': 'Dames', 'Tees': 'Départs', 'Choose the tees': 'Choisissez les départs', 'Add a GolfCourseAPI key': 'Ajouter une clé GolfCourseAPI',
  'Uses GolfCourseAPI: one search or course opening counts as 1 of your 35 free requests per day. Hole-by-hole pars and distances per tee, but no hole drawings.': "Utilise GolfCourseAPI : chaque recherche ou ouverture de parcours compte pour 1 de vos 35 requêtes gratuites par jour. Pars et distances trou par trou pour chaque départ, mais pas de dessin des trous.",
  'Loading course…': 'Chargement du parcours…',
  'This course has no hole-by-hole data in GolfCourseAPI. You can enter it manually instead.': "Ce parcours n'a pas de données trou par trou dans GolfCourseAPI. Vous pouvez le saisir à la main.",
  'Imported {n} holes from GolfCourseAPI ({tee} tees). Check par and distances, then save. Hole drawings are not included: pick a shape per hole if you like.': "Import de {n} trous depuis GolfCourseAPI (départs {tee}). Vérifiez pars et distances, puis enregistrez. Les dessins de trous ne sont pas inclus : choisissez une forme par trou si vous le souhaitez.",
  'Course database': 'Base de parcours', 'API key': 'Clé API',
  'Optional. A free key from golfcourseapi.com lets you search a larger course database. The key stays on this device only and is not included in backups.': "Facultatif. Une clé gratuite de golfcourseapi.com permet de chercher dans une plus grande base de parcours. La clé reste sur cet appareil uniquement et n'est pas incluse dans les sauvegardes.",
  'Requests used today (approximate, this device)': "Requêtes utilisées aujourd'hui (approximatif, cet appareil)",
  'Could not reach GolfCourseAPI. Check your connection. If it keeps failing, the service may block requests from browsers.': "Impossible de joindre GolfCourseAPI. Vérifiez votre connexion. Si cela persiste, le service bloque peut-être les requêtes depuis un navigateur.",
  'Invalid API key. Check it in Settings.': 'Clé API invalide. Vérifiez-la dans les Réglages.',
  'Daily request limit reached (35 per day on the free plan). Try again tomorrow.': 'Limite quotidienne atteinte (35 par jour avec l’offre gratuite). Réessayez demain.',
  'GolfCourseAPI error': 'Erreur GolfCourseAPI',
  'Copy last API response': 'Copier la dernière réponse de l’API', 'Copied. Paste it in the chat.': 'Copié. Collez-le dans la conversation.',
  'Select the text below and copy it.': 'Sélectionnez le texte ci-dessous et copiez-le.', 'No API request made yet.': 'Aucune requête API effectuée pour l’instant.',
  // osm
  'OpenStreetMap has no hole data for this course yet. You can enter it manually instead.': "OpenStreetMap n'a pas encore les trous de ce parcours. Vous pouvez le saisir à la main.",
  'Map server unreachable': 'Serveur de cartes injoignable', 'Hole layout drawing': 'Dessin du trou', 'Schematic hole layout': 'Plan schématique du trou',
};
