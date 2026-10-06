/**
 * The legal documents of Qbix, in French (the language of the law that governs them) and in English: the legal
 * notice, the privacy policy and the terms of use. They say what the app really does: what it keeps, where, for how
 * long and who sees it (see rust-api/src/activity.rs for the logs' retention, coaching.rs for calls).
 * Other languages read the English version.
 */
import type { ReactNode } from "react";
import { IDENTITY as I } from "./identity";
import { RETENTION } from "./retention";

export type { DocumentId } from "./paths";
import type { DocumentId } from "./paths";
export type DocumentLanguage = "fr" | "en";
export interface LegalDocument {
  title: string;
  intro?: ReactNode;
  sections: { title: string; body: ReactNode; /** Its anchor in the page, for links straight to it. */ id?: string }[];
}

const mail = <a href={`mailto:${I.email}`}>{I.email}</a>;
const site = <a href={I.site}>{I.site.replace(/^https:\/\//, "")}</a>;

export const DOCUMENTS: Record<DocumentId, Record<DocumentLanguage, LegalDocument>> = {
  legal: {
    fr: {
      title: "Mentions légales",
      intro: <p>Conformément à l'article 6 de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN), voici les informations sur l'éditeur et l'hébergeur de Qbix ({site}), de ses applications pour ordinateur et Android et de leur API.</p>,
      sections: [
        { title: "Éditeur", body: <p>{I.editor}, {I.status}<br />{I.address}<br />Contact : {mail}</p> },
        { title: "Directeur de la publication", body: <p>{I.director}</p> },
        { title: "Hébergement", body: <p>{I.host.name}<br />{I.host.address}<br />{I.host.phone}<br />Le serveur et les données qu'il conserve se trouvent en {I.host.country}.</p> },
        {
          title: "Propriété intellectuelle",
          body: (
            <>
              <p>L'application, son code, son interface, ses textes, ses cours et son logo appartiennent à l'éditeur, sauf mention contraire. Toute reproduction ou réutilisation sans autorisation est interdite, en dehors des usages permis par la loi.</p>
              <p>Qbix utilise des logiciels libres, chacun sous sa propre licence (notamment cubing.js sous licence MPL 2.0, React, Motion et Sonner sous licence MIT) ; leurs licences sont fournies avec l'application. Les algorithmes du catalogue sont des connaissances partagées par la communauté du speedcubing ; leurs sources (SpeedCubeDB, J Perm, F2L Trainer…) sont citées à côté de chacun.</p>
              <p>Rubik's Cube est une marque de Spin Master. Qbix n'est affilié ni à la World Cube Association (WCA) ni aux fabricants de puzzles cités ; les noms des épreuves et des puzzles ne servent qu'à les désigner.</p>
            </>
          ),
        },
        { title: "Données personnelles", body: <p>Le traitement des données personnelles est décrit dans la <a href="/privacy">politique de confidentialité</a>. L'utilisation de l'application est régie par les <a href="/terms">conditions d'utilisation</a>.</p> },
        { title: "Signaler un contenu", body: <p>Pour signaler un contenu illicite publié dans l'application (message, nom de groupe, profil…), écris à {mail} en précisant où il se trouve. Il sera examiné rapidement et retiré s'il est illicite ou contraire aux conditions d'utilisation.</p> },
      ],
    },
    en: {
      title: "Legal notice",
      intro: <p>As required by article 6 of French law no. 2004-575 of 21 June 2004 on confidence in the digital economy (LCEN), here is who publishes and who hosts Qbix ({site}), its desktop and Android apps and their API.</p>,
      sections: [
        { title: "Publisher", body: <p>{I.editor}, {I.status === "personne physique" ? "an individual" : I.status}<br />{I.address}<br />Contact: {mail}</p> },
        { title: "Publication director", body: <p>{I.director}</p> },
        { title: "Hosting", body: <p>{I.host.name}<br />{I.host.address}<br />{I.host.phone}<br />The server and the data it keeps are in {I.host.country === "France" ? "France" : I.host.country}.</p> },
        {
          title: "Intellectual property",
          body: (
            <>
              <p>The app, its code, interface, texts, courses and logo belong to the publisher unless stated otherwise. Copying or reusing them without permission is forbidden, outside the uses the law allows.</p>
              <p>Qbix uses free software, each under its own licence (cubing.js under the MPL 2.0; React, Motion and Sonner under the MIT licence among others); their licences ship with the app. The catalogue's algorithms are knowledge shared by the speedcubing community; their sources (SpeedCubeDB, J Perm, F2L Trainer…) are credited beside each of them.</p>
              <p>Rubik's Cube is a trademark of Spin Master. Qbix is affiliated neither with the World Cube Association (WCA) nor with the puzzle makers it names; event and puzzle names only identify them.</p>
            </>
          ),
        },
        { title: "Personal data", body: <p>How personal data is handled is described in the <a href="/privacy">privacy policy</a>. Using the app is governed by the <a href="/terms">terms of use</a>.</p> },
        { title: "Reporting content", body: <p>To report unlawful content posted in the app (a message, a group's name, a profile…), write to {mail} saying where it is. It will be looked at promptly and removed if it is unlawful or breaks the terms of use.</p> },
      ],
    },
  },

  privacy: {
    fr: {
      title: "Politique de confidentialité",
      intro: (
        <>
          <p>Qbix est une application gratuite, sans publicité ni traceur. Elle ne garde que ce qu'il faut pour fonctionner : tes temps et ce que tu fais dans l'app, pour te les rendre sur tous tes appareils, et des journaux techniques pour la protéger. Rien n'est vendu ni partagé à des fins commerciales.</p>
          <p>Cette politique explique quelles données sont traitées, pourquoi, combien de temps et quels sont tes droits, conformément au règlement général sur la protection des données (RGPD) et à la loi Informatique et Libertés.</p>
        </>
      ),
      sections: [
        { title: "Responsable du traitement", body: <p>{I.editor}, {I.address}, joignable à {mail}.</p> },
        {
          title: "Utiliser Qbix sans compte",
          body: <p>Le chrono, les algorithmes, l'entraînement et les cours fonctionnent sur ton appareil. Tant que tu ne crées pas de compte, tes temps et tes réglages restent dans le stockage de ton navigateur ou de l'application, et rien de ce que tu fais n'est envoyé au serveur, à l'exception des journaux techniques décrits plus bas.</p>,
        },
        {
          title: "Les données traitées et pourquoi",
          body: (
            <ul>
              <li><strong>Ton compte</strong> : ton pseudo, ton mot de passe (conservé uniquement sous forme chiffrée irréversible, avec Argon2id), sa date de création, la date de ta dernière activité et, si tu en ajoutes une, ta photo de profil. Ils servent à te connecter et à synchroniser tes données. Base légale : l'exécution des conditions d'utilisation (le contrat).</li>
              <li><strong>Ta pratique</strong> : tes temps, leurs mélanges, pénalités et commentaires, les mouvements enregistrés par un cube connecté, tes sessions, les cas que tu as marqués comme appris, ton ordre d'apprentissage et ce que tu as indiqué à l'inscription (puzzles et méthodes que tu connais, meilleurs temps). Ils sont enregistrés d'abord sur ton appareil puis synchronisés avec ton compte, pour les retrouver partout. Base légale : le contrat.</li>
              <li><strong>La communauté</strong> : tes amis et demandes d'amis, tes messages, tes groupes et ton rôle dans chacun, tes inscriptions aux tournois, tes matchs, battles et leurs résultats. Base légale : le contrat.</li>
              <li><strong>Les duels</strong> : pendant une course, ton pseudo, ton niveau (calculé sur ton appareil à partir de tes derniers temps) et tes temps sont transmis à ton adversaire. Le serveur conserve le résultat de chaque course terminée. Base légale : le contrat.</li>
              <li><strong>Le coaching</strong> : pour devenir coach, ta candidature (adresse e-mail, épreuves, expérience, message) ; ton profil public de coach et tes disponibilités ; les séances réservées, les avis, les messages, photos et vidéos échangés, et les notes privées qu'un coach prend sur ses élèves. Les appels vidéo passent directement entre les deux participants (de pair à pair) : le serveur ne fait que mettre les deux appareils en relation et ne voit ni n'enregistre l'image ni le son. Base légale : le contrat.</li>
              <li><strong>Les journaux techniques</strong> : pour chaque requête reçue par le serveur, l'adresse IP, la date, l'adresse demandée, le résultat, la durée, le navigateur utilisé et, si tu es connecté, ton compte ; des totaux quotidiens par adresse IP ; et ton activité quotidienne (jours d'utilisation). Ils servent à assurer la sécurité du service, à limiter les abus et à corriger les pannes. Base légale : l'intérêt légitime de l'éditeur à protéger et faire fonctionner le service.</li>
            </ul>
          ),
        },
        {
          title: "Qui voit tes données",
          body: (
            <>
              <p>Ton pseudo et ta photo sont visibles des autres joueurs dans la communauté, les tournois, les duels et le coaching. Tes messages sont lus par leurs destinataires (ton ami, ou les membres du groupe). Tes résultats de matchs et de tournois sont visibles des membres du groupe concerné, ou de tous pour les tournois ouverts à tous. Ton profil de coach est public. Tes temps, eux, ne sont montrés à personne d'autre que toi, sauf à un coach avec qui tu as réservé une séance (il voit ta pratique pour te conseiller).</p>
              <p>L'éditeur accède aux données pour administrer le service (statistiques d'usage, modération, assistance). Aucune donnée n'est vendue, louée ni utilisée à des fins publicitaires.</p>
            </>
          ),
        },
        {
          title: "Prestataires et transferts",
          body: (
            <>
              <p>Les données sont conservées sur le serveur de Qbix, en {I.host.country} (voir les <a href="/legal">mentions légales</a>).</p>
              <p>Pour établir un appel vidéo de coaching, ton appareil interroge des serveurs STUN de Google, qui voient ton adresse IP le temps de la mise en relation ; Google peut traiter cette adresse hors de l'Union européenne. Aucun autre service tiers ne reçoit tes données.</p>
              <p>Les liens vers d'autres sites (vidéos YouTube d'algorithmes, Buy Me a Coffee, GitHub) ouvrent ces sites, qui appliquent leur propre politique de confidentialité.</p>
            </>
          ),
        },
        {
          title: "Durées de conservation",
          body: (
            <ul>
              <li>Ton compte et toutes ses données sont conservés tant que le compte existe. Quand tu le supprimes, ils sont effacés immédiatement et définitivement du serveur.</li>
              <li>Les journaux de requêtes sont effacés au bout de {RETENTION.log} jours ; les totaux quotidiens par adresse IP au bout de {RETENTION.traffic} jours ; l'activité quotidienne par compte au bout de {RETENTION.activity} jours. À la suppression du compte, ces journaux ne sont plus rattachés à lui.</li>
              <li>Les résultats des duels et des matchs auxquels tu as participé restent, sans ton nom, pour que ceux de tes adversaires restent justes.</li>
              <li>Les données gardées sur ton appareil y restent jusqu'à ce que tu les effaces (en te déconnectant, en effaçant les données du site ou en désinstallant l'application).</li>
            </ul>
          ),
        },
        {
          id: "cookies",
          title: "Cookies et stockage sur ton appareil",
          body: <p>Qbix n'utilise aucun cookie publicitaire ni de mesure d'audience, et aucun traceur. L'application enregistre sur ton appareil ce dont elle a besoin pour fonctionner : tes temps et réglages (pour marcher hors ligne), la langue choisie et le jeton qui garde ta session ouverte. L'espace d'administration utilise un cookie de session. Ces éléments sont strictement nécessaires au service et ne demandent donc pas de consentement.</p>,
        },
        {
          title: "Tes droits",
          body: (
            <>
              <p>Tu peux à tout moment accéder à tes données, les rectifier, les effacer, en obtenir une copie dans un format réutilisable, t'opposer à leur traitement ou en demander la limitation :</p>
              <ul>
                <li><strong>Copie de tes données</strong> : Réglages → Télécharger mes données (un fichier JSON avec tes temps, sessions, cas appris et ton profil).</li>
                <li><strong>Suppression</strong> : Réglages → Supprimer mon compte. Tout est effacé du serveur sur-le-champ.</li>
                <li><strong>Pour le reste</strong> (accès aux journaux, messages, coaching…) : écris à {mail}. Une réponse t'est apportée sous un mois.</li>
              </ul>
              <p>Si tu estimes que tes droits ne sont pas respectés, tu peux adresser une réclamation à la CNIL (cnil.fr).</p>
            </>
          ),
        },
        { title: "Mineurs", body: <p>Qbix est ouvert à tous les âges. Si tu as moins de 15 ans, demande l'accord d'un de tes parents avant de créer un compte. Un parent peut demander la suppression du compte de son enfant à {mail}.</p> },
        { title: "Sécurité", body: <p>Les échanges avec le serveur sont chiffrés (HTTPS). Les mots de passe ne sont jamais conservés en clair et les tentatives de connexion sont limitées. L'accès à l'administration est réservé à l'éditeur.</p> },
        { title: "Modifications", body: <p>Cette politique peut évoluer avec l'application. La date de dernière mise à jour figure en haut de la page ; en cas de changement important, tu en seras informé dans l'application.</p> },
      ],
    },
    en: {
      title: "Privacy policy",
      intro: (
        <>
          <p>Qbix is a free app, without ads or trackers. It only keeps what it needs to work: your times and what you do in the app, to give them back to you on all your devices, and technical logs to protect it. Nothing is sold or shared for commercial purposes.</p>
          <p>This policy explains which data is processed, why, for how long and what your rights are, under the General Data Protection Regulation (GDPR) and the French Data Protection Act.</p>
        </>
      ),
      sections: [
        { title: "Data controller", body: <p>{I.editor}, {I.address}, reachable at {mail}.</p> },
        { title: "Using Qbix without an account", body: <p>The timer, the algorithms, training and the courses work on your device. Until you create an account, your times and settings stay in your browser's or the app's storage and nothing you do is sent to the server, apart from the technical logs described below.</p> },
        {
          title: "The data processed and why",
          body: (
            <ul>
              <li><strong>Your account</strong>: your username, your password (kept only as an irreversible hash, with Argon2id), when it was created, when you were last active and, if you add one, your profile picture. They are used to sign you in and to synchronise your data. Legal basis: performing the terms of use (the contract).</li>
              <li><strong>Your practice</strong>: your times with their scrambles, penalties and comments, the moves recorded by a connected cube, your sessions, the cases you marked as learned, your learning order and what you said when you signed up (the puzzles and methods you know, your best times). They are saved on your device first, then synchronised with your account so you find them everywhere. Legal basis: the contract.</li>
              <li><strong>The community</strong>: your friends and friend requests, your messages, your groups and your role in each, your tournament registrations, your matches, battles and their results. Legal basis: the contract.</li>
              <li><strong>Duels</strong>: during a race, your username, your level (worked out on your device from your latest times) and your times are sent to your opponent. The server keeps the result of each finished race. Legal basis: the contract.</li>
              <li><strong>Coaching</strong>: to become a coach, your application (e-mail address, events, experience, message); your public coach profile and availability; booked sessions, reviews, the messages, pictures and videos exchanged, and the private notes a coach keeps on their students. Video calls go straight between the two participants (peer to peer): the server only connects the two devices and never sees or records the picture or the sound. Legal basis: the contract.</li>
              <li><strong>Technical logs</strong>: for each request the server receives, the IP address, the time, the address requested, the result, the duration, the browser used and, when you are signed in, your account; daily totals per IP address; and your daily activity (the days you use the app). They keep the service secure, limit abuse and help fix failures. Legal basis: the publisher's legitimate interest in protecting and running the service.</li>
            </ul>
          ),
        },
        {
          title: "Who sees your data",
          body: (
            <>
              <p>Your username and picture are visible to other players in the community, tournaments, duels and coaching. Your messages are read by the people they are for (your friend, or the group's members). Your match and tournament results are visible to the members of the group concerned, or to everyone for tournaments open to all. A coach's profile is public. Your times are shown to no one but you, except to a coach you booked a session with (they see your practice to advise you).</p>
              <p>The publisher accesses data to run the service (usage statistics, moderation, support). No data is sold, rented or used for advertising.</p>
            </>
          ),
        },
        {
          title: "Service providers and transfers",
          body: (
            <>
              <p>Data is kept on Qbix's server, in {I.host.country === "France" ? "France" : I.host.country} (see the <a href="/legal">legal notice</a>).</p>
              <p>To set up a coaching video call, your device asks Google's STUN servers for its public address; they see your IP address while the call is being connected, and Google may process it outside the European Union. No other third-party service receives your data.</p>
              <p>Links to other sites (YouTube videos of algorithms, Buy Me a Coffee, GitHub) open those sites, which apply their own privacy policies.</p>
            </>
          ),
        },
        {
          title: "How long data is kept",
          body: (
            <ul>
              <li>Your account and all its data are kept for as long as the account exists. When you delete it, they are erased from the server at once and for good.</li>
              <li>Request logs are erased after {RETENTION.log} days; daily totals per IP address after {RETENTION.traffic} days; daily activity per account after {RETENTION.activity} days. Once the account is deleted, these logs are no longer linked to it.</li>
              <li>The results of the duels and matches you took part in remain, without your name, so that your opponents' records stay right.</li>
              <li>The data kept on your device stays there until you erase it (by signing out, clearing the site's data or uninstalling the app).</li>
            </ul>
          ),
        },
        { id: "cookies", title: "Cookies and storage on your device", body: <p>Qbix uses no advertising or audience-measurement cookies, and no trackers. The app stores on your device what it needs to work: your times and settings (to work offline), the language you chose and the token that keeps you signed in. The administration area uses a session cookie. These are strictly necessary for the service and therefore need no consent.</p> },
        {
          title: "Your rights",
          body: (
            <>
              <p>At any time you can access your data, correct it, erase it, get a copy of it in a reusable format, object to its processing or ask for it to be restricted:</p>
              <ul>
                <li><strong>A copy of your data</strong>: Settings → Download my data (a JSON file with your times, sessions, learned cases and profile).</li>
                <li><strong>Deletion</strong>: Settings → Delete my account. Everything is erased from the server on the spot.</li>
                <li><strong>Anything else</strong> (logs, messages, coaching…): write to {mail}. You will get an answer within a month.</li>
              </ul>
              <p>If you believe your rights are not respected, you can complain to the CNIL (cnil.fr), the French data protection authority, or to the authority of your country.</p>
            </>
          ),
        },
        { title: "Minors", body: <p>Qbix is open to all ages. If you are under 15, ask one of your parents before creating an account. A parent can ask for their child's account to be deleted at {mail}.</p> },
        { title: "Security", body: <p>Exchanges with the server are encrypted (HTTPS). Passwords are never stored in clear and sign-in attempts are limited. Access to the administration is reserved to the publisher.</p> },
        { title: "Changes", body: <p>This policy may change with the app. The date of its last update is at the top of the page; you will be told in the app of any significant change.</p> },
      ],
    },
  },

  terms: {
    fr: {
      title: "Conditions d'utilisation",
      intro: <p>Ces conditions encadrent l'utilisation de Qbix : le site {site}, ses applications pour ordinateur et Android et leur API. En créant un compte, tu les acceptes.</p>,
      sections: [
        { title: "Le service", body: <p>Qbix est une application gratuite pour chronométrer ses résolutions, apprendre et s'entraîner sur les puzzles des épreuves de la WCA, affronter d'autres joueurs, échanger avec eux et se faire coacher. L'éditeur peut faire évoluer, suspendre ou arrêter tout ou partie du service, en prévenant ses utilisateurs lorsque c'est possible.</p> },
        { title: "Ton compte", body: <p>Un compte se crée avec un pseudo et un mot de passe. Ton pseudo est visible des autres joueurs : il ne doit ni usurper l'identité de quelqu'un, ni être injurieux ou trompeur. Tu es responsable de ton mot de passe et de ce qui est fait depuis ton compte. Si tu as moins de 15 ans, demande l'accord d'un parent.</p> },
        {
          title: "Règles de la communauté",
          body: (
            <>
              <p>Dans les messages, les groupes, les duels, les tournois et le coaching, tu t'engages à :</p>
              <ul>
                <li>respecter les autres joueurs : pas d'insulte, de harcèlement, de menace, de discrimination ni de contenu haineux ;</li>
                <li>ne publier aucun contenu illicite, violent, pornographique, ni aucune donnée personnelle d'autrui sans son accord ;</li>
                <li>ne pas envoyer de messages publicitaires ou en masse, ni tenter de perturber le service ou d'accéder aux données des autres ;</li>
                <li>jouer honnêtement : tes temps sont ceux de vraies résolutions du mélange donné, sans aide ni manipulation du chrono.</li>
              </ul>
              <p>L'éditeur peut retirer un contenu qui enfreint ces règles et suspendre ou supprimer un compte, en cas de manquement grave ou répété. Pour signaler un contenu ou un comportement, écris à {mail}.</p>
            </>
          ),
        },
        {
          title: "Groupes, matchs et tournois",
          body: (
            <>
              <p>Le propriétaire d'un groupe et les administrateurs qu'il désigne le gèrent : invitations, membres, tournois. Les tournois ouverts à tous sont organisés par l'éditeur ; ceux d'un groupe par ses organisateurs, qui peuvent les démarrer, les annuler ou attribuer un match à un joueur dont l'adversaire ne se présente pas. Leurs décisions s'imposent aux participants.</p>
              <p>Les tournois et les battles de Qbix sont des jeux sans enjeu : aucune mise, aucun prix ni aucun lot n'y est associé par l'application. Ce ne sont pas des compétitions officielles de la WCA.</p>
            </>
          ),
        },
        { title: "Coaching", body: <p>Les coachs sont des joueurs indépendants dont la candidature a été acceptée par l'éditeur. La séance, son contenu et son prix sont convenus entre le coach et l'élève : l'éditeur fournit l'outil (réservation, messagerie, appel) mais n'est pas partie à leur relation et n'encaisse aucun paiement. Une séance ne peut plus être annulée dans les 24 heures qui précèdent son début.</p> },
        { title: "Tes contenus", body: <p>Tu restes propriétaire de ce que tu publies (messages, commentaires, photos, profil de coach). Tu autorises l'éditeur à les conserver et à les afficher aux personnes concernées, dans la seule mesure nécessaire au fonctionnement du service. Ils sont supprimés avec ton compte.</p> },
        { title: "Propriété intellectuelle", body: <p>L'application, ses textes, ses cours et son logo sont protégés (voir les <a href="/legal">mentions légales</a>). Tu peux les utiliser pour ton usage personnel dans l'application ; leur reproduction ou leur réutilisation en dehors nécessite l'accord de l'éditeur.</p> },
        { title: "Responsabilité", body: <p>Le service est fourni gratuitement, tel quel, sans garantie de disponibilité continue ni d'absence d'erreur. L'éditeur fait de son mieux pour préserver tes données, qui sont aussi gardées sur ton appareil, mais ne peut être tenu responsable d'une perte de données, d'une interruption du service ou du comportement des autres utilisateurs, sauf faute de sa part.</p> },
        { title: "Fin de l'utilisation", body: <p>Tu peux supprimer ton compte à tout moment depuis les réglages : toutes ses données sont alors effacées du serveur (voir la <a href="/privacy">politique de confidentialité</a>).</p> },
        { title: "Modifications et droit applicable", body: <p>Ces conditions peuvent évoluer ; la version en vigueur est celle publiée sur cette page, et un changement important est annoncé dans l'application. Elles sont régies par le droit français. En cas de litige, une solution amiable est recherchée en priorité en écrivant à {mail} ; à défaut, les tribunaux français sont compétents, sous réserve des règles protectrices du consommateur.</p> },
      ],
    },
    en: {
      title: "Terms of use",
      intro: <p>These terms govern the use of Qbix: the site {site}, its desktop and Android apps and their API. By creating an account, you accept them.</p>,
      sections: [
        { title: "The service", body: <p>Qbix is a free app to time your solves, learn and train on the puzzles of the WCA events, race other players, talk with them and get coached. The publisher may change, suspend or stop all or part of the service, warning its users when possible.</p> },
        { title: "Your account", body: <p>An account is created with a username and a password. Your username is visible to other players: it must not impersonate anyone, nor be offensive or misleading. You are responsible for your password and for what is done from your account. If you are under 15, ask a parent first.</p> },
        {
          title: "Community rules",
          body: (
            <>
              <p>In messages, groups, duels, tournaments and coaching, you agree to:</p>
              <ul>
                <li>respect other players: no insults, harassment, threats, discrimination or hateful content;</li>
                <li>post nothing unlawful, violent or pornographic, nor anyone's personal data without their consent;</li>
                <li>send no advertising or bulk messages, and never try to disrupt the service or reach other people's data;</li>
                <li>play fair: your times are those of real solves of the scramble given, without help or tampering with the timer.</li>
              </ul>
              <p>The publisher may remove content that breaks these rules and suspend or delete an account after a serious or repeated breach. To report content or behaviour, write to {mail}.</p>
            </>
          ),
        },
        {
          title: "Groups, matches and tournaments",
          body: (
            <>
              <p>A group's owner and the admins they name run it: invitations, members, tournaments. Tournaments open to everyone are organised by the publisher; a group's by its organisers, who may start them, cancel them or give a match to a player whose opponent does not show up. Their decisions bind the participants.</p>
              <p>Qbix's tournaments and battles are played for nothing: the app attaches no stake, prize or reward to them. They are not official WCA competitions.</p>
            </>
          ),
        },
        { title: "Coaching", body: <p>Coaches are independent players whose application the publisher accepted. A session, its content and its price are agreed between the coach and the student: the publisher provides the tool (booking, messages, call) but is not a party to their relationship and collects no payment. A session can no longer be cancelled in the 24 hours before it starts.</p> },
        { title: "Your content", body: <p>You keep ownership of what you post (messages, comments, pictures, coach profile). You allow the publisher to keep it and show it to the people concerned, only as far as the service needs. It is deleted with your account.</p> },
        { title: "Intellectual property", body: <p>The app, its texts, courses and logo are protected (see the <a href="/legal">legal notice</a>). You may use them for your own use within the app; copying or reusing them elsewhere needs the publisher's permission.</p> },
        { title: "Liability", body: <p>The service is provided free of charge, as it is, without any guarantee of continuous availability or of being free of errors. The publisher does its best to preserve your data, which is also kept on your device, but cannot be held liable for a loss of data, an interruption of the service or other users' behaviour, unless at fault.</p> },
        { title: "Ending your use", body: <p>You can delete your account at any time from the settings: all its data is then erased from the server (see the <a href="/privacy">privacy policy</a>).</p> },
        { title: "Changes and governing law", body: <p>These terms may change; the version in force is the one published on this page, and a significant change is announced in the app. They are governed by French law. In case of a dispute, an amicable solution is sought first by writing to {mail}; failing that, the French courts have jurisdiction, subject to the rules that protect consumers.</p> },
      ],
    },
  },
};
