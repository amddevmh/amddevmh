import { fr, type Dictionary } from './fr'

/**
 * Point d'accès unique aux chaînes du site. Au lancement : français uniquement.
 * Pour ajouter l'arabe (dir = 'rtl') ou l'anglais, créer ar.ts / en.ts de type Dictionary
 * et choisir le dictionnaire selon la langue de la requête.
 */
export function getDictionary(): Dictionary {
  return fr
}

export const t = fr
export type { Dictionary }
