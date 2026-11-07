// account-page.js — connexion.html: log in, sign up, then (when logged in) sync, log out,
// or delete the account. Everything else on the site works without an account.

import { h, button } from './dom.js';
import { accountsEnabled, currentSession, lastSync, signUp, logIn, logOut, deleteAccount, syncNow, startSync } from '../account.js';

const app = document.getElementById('account-app');

function field(label, type, name, autocomplete, extra = {}) {
  const input = Object.assign(h('input'), { type, name, required: true, autocomplete, ...extra });
  return h('label', 'form-field', h('span', null, label), input);
}

function message(box, text, ok = false) {
  box.textContent = text;
  box.className = ok ? 'form-msg ok' : 'form-msg';
  box.hidden = !text;
}

/** A form that calls action(values) and shows its error message. */
function form(title, fields, submitText, action) {
  const msg = h('p', 'form-msg');
  msg.hidden = true;
  const submit = h('button', 'primary', submitText);
  submit.type = 'submit';
  const f = h('form', 'panel account-form', h('h2', null, title), fields, msg, submit);
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(f));
    submit.disabled = true;
    message(msg, '');
    try {
      await action(values, msg);
    } catch (err) {
      message(msg, err.message);
    } finally {
      submit.disabled = false;
    }
  });
  return f;
}

const PRIVACY = h('p', 'muted privacy',
  'Ce qui est enregistré sur le serveur : votre nom, votre e-mail, votre mot de passe sous forme hachée (jamais en clair) et votre progression. ',
  'Rien d\'autre, aucune publicité, aucun partage. Vous pouvez supprimer votre compte et toutes ses données à tout moment.');

function loggedOut() {
  app.replaceChildren(
    h('div', 'account-grid',
      form('Se connecter', [
        field('E-mail', 'email', 'email', 'email'),
        field('Mot de passe', 'password', 'motDePasse', 'current-password'),
      ], 'Se connecter', async (v) => {
        await logIn(v.email, v.motDePasse);
        render();
      }),
      form('Créer un compte', [
        field('Nom', 'text', 'nom', 'name', { maxLength: 60 }),
        field('E-mail', 'email', 'email', 'email'),
        field('Mot de passe (8 caractères minimum)', 'password', 'motDePasse', 'new-password', { minLength: 8 }),
        field('Confirmer le mot de passe', 'password', 'confirmation', 'new-password', { minLength: 8 }),
      ], 'Créer mon compte', async (v) => {
        if (v.motDePasse !== v.confirmation) throw new Error('Les deux mots de passe ne sont pas identiques.');
        await signUp(v.nom, v.email, v.motDePasse);
        render();
      })),
    PRIVACY);
}

function loggedIn(session) {
  const status = h('p', 'form-msg ok');
  const when = lastSync();
  message(status, when ? `Progression synchronisée le ${new Date(when).toLocaleString('fr-FR')}.` : 'Progression pas encore synchronisée.', true);

  const danger = h('div', 'reset-box');
  const askDelete = button('Supprimer mon compte', null, () => {
    danger.replaceChildren(form('Supprimer le compte', [
      h('p', null, 'Votre compte et toute la progression enregistrée sur le serveur seront effacés définitivement. La progression de ce navigateur, elle, reste ici.'),
      field('Votre mot de passe, pour confirmer', 'password', 'motDePasse', 'current-password'),
    ], 'Supprimer définitivement', async (v) => {
      await deleteAccount(v.motDePasse);
      render();
    }), button('Annuler', null, () => danger.replaceChildren(askDelete)));
  });
  danger.append(askDelete);

  app.replaceChildren(
    h('section', 'panel account-me',
      h('h2', null, `Bonjour ${session.utilisateur.nom}`),
      h('p', null, `Connecté avec ${session.utilisateur.email}. Votre progression est enregistrée sur votre compte et fusionnée avec celle de chaque appareil où vous vous connectez.`),
      status,
      h('div', 'quiz-actions',
        button('Synchroniser maintenant', 'primary', async () => {
          try {
            await syncNow();
            message(status, `Progression synchronisée le ${new Date().toLocaleString('fr-FR')}.`, true);
          } catch (err) {
            message(status, err.message);
          }
        }),
        Object.assign(h('a', 'button', 'Voir ma progression'), { href: './progression.html' }),
        button('Se déconnecter', null, async () => {
          await logOut().catch(() => {});
          render();
        }))),
    danger,
    PRIVACY);
}

function render() {
  if (!accountsEnabled()) {
    app.replaceChildren(h('section', 'panel',
      h('h2', null, 'Comptes pas encore activés'),
      h('p', null, 'Le serveur des comptes n\'est pas encore en ligne sur ce site. Vous pouvez utiliser tout PacketLab sans compte : votre progression est gardée dans ce navigateur.')));
    return;
  }
  const s = currentSession();
  if (s) loggedIn(s);
  else loggedOut();
}

startSync();
render();
