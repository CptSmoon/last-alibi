// Scripted stand-in for Gemini Live, so the interrogation screen can be tried without an API key.
// Same inputs and outputs as the live session: a line of text in; a reply, a mood and an
// optional reveal_secret "tool call" out. The keyword matcher is the ONLY fake part.
window.DEMO = {
  emile: {
    greet: "Bonsoir, Monsieur l'Inspecteur. Forty-four years at the Mirabeau, and never a night like this one.",
    suggest: ['Who used the lift after eleven?', 'When did Victor last call down?', 'Tell me about the service stairs.'],
    topics: [
      { k: ['lift', 'elevator', 'ascenseur', 'who went up', 'third floor', 'after eleven'], r: "After eleven? Let me see... At half past eleven I took the money gentleman up to the third. Grey spectacles, a leather ledger under his arm. He said he had business with Monsieur Castellane.", reveal: 's_emile_lift' },
      { k: ['call', 'phone', 'telephone', 'champagne', 'alive', 'last'], r: "Monsieur Castellane rang down at twenty past eleven. Dom Perignon, for a quarter past midnight. He sounded almost cheerful.", reveal: 's_emile_call' },
      { k: ['body', 'found', 'find', 'discover'], r: "I brought the champagne at a quarter past twelve. No answer. I used the pass key. He was on the carpet by the little marble table." },
      { k: ['margot', 'maid', 'linen'], r: "Mademoiselle Lenoir is a good girl, Monsieur. Whatever you may have heard.", mood: 'defensive' },
      { k: ['stairs', 'service'], r: "The service stairs run from the kitchens to every floor. Nobody watches them. Guests who wish to be discreet know that very well." },
      { k: ['helene', 'hélène', 'wife', 'madame'], r: "I took Madame up at ten to eleven. I saw her in 'Les Enfants du Port' in 1946. She has not changed." },
    ],
    evidence: {
      e_diary: { r: "A.P.... Armand Petit, I should think. The money gentleman. That fits with the lift, Monsieur." },
      e_statuette: { r: "His Golden Gull. He carried it up himself at a quarter to eleven, like a baby." },
    },
    fallback: "If Monsieur l'Inspecteur will permit me, I only answer what I know. And that, I do not know.",
  },
  armand: {
    greet: "Monsieur l'Inspecteur. A terrible accident. Victor drank, you know. Everybody knows.",
    suggest: ['Where were you after eleven?', 'What happened to your hand?', 'Are the accounts in order?'],
    topics: [
      { k: ['where', 'eleven', 'room', 'alibi', 'letters', 'evening', 'night'], r: "I left the gala at eleven precisely. Room 212. I wrote letters to my daughter until I heard the commotion, at twelve seventeen." },
      { k: ['hand', 'bandage', 'cut', 'palm'], r: "This? I cut it shaving. Before dinner. I am a clumsy man, Monsieur, a clumsy man.", mood: 'nervous' },
      { k: ['account', 'money', 'books', 'ledger', 'embezzl', 'franc'], r: "The accounts are perfectly in order. I have kept Victor's books for twenty years.", mood: 'defensive' },
      { k: ['helene', 'hélène', 'divorce', 'wife'], r: "I should not say... but he was divorcing her. Under the contract she would have had nothing. Nothing at all." },
      { k: ['solange', 'script', 'writer'], r: "Madame Duret was very, very angry tonight. The programme, you see. Her name was not on it." },
      { k: ['kill', 'murder', 'did you', 'confess', 'guilty'], r: "Me? Monsieur, I count other people's money. I have never raised my hand to anyone.", mood: 'nervous' },
    ],
    evidence: {
      e_lift_log: { r: "The third floor... yes. Yes, I went up. To discuss the accounts. He was asleep in his armchair when I left, at twenty-five to twelve. I did not say so because it looked bad.", reveal: 's_armand_lift', mood: 'nervous' },
      e_diary: { r: "Half past eleven, yes, we had an appointment. I went up. He was asleep in his armchair when I left. That is all.", reveal: 's_armand_lift', mood: 'nervous' },
      e_ledger_ash: { r: "Irregularities. Temporary ones. I would have put it all back, Monsieur! But that is not murder. That is not murder.", reveal: 's_armand_embezzle', mood: 'defensive' },
      e_bar_quarrel: { r: "He was drunk. He said many things to many people tonight.", mood: 'nervous' },
      e_cut_hand: { r: "I told you. Shaving. Before dinner.", mood: 'nervous' },
      e_margot_sighting: { r: "A man with spectacles. Half the men in this hotel wear spectacles, Monsieur.", mood: 'defensive' },
    },
    confession: "He laughed at me. He said he would see me in prison and my daughter in the street. The bronze bird was just there, on the mantel. I only wanted him to stop laughing. Then the fire, the pages, the table. I cut my hand on its wing. I went down the service stairs. Twenty years, Monsieur. Twenty years.",
    fallback: "I am not sure I follow you, Monsieur l'Inspecteur.",
  },
  margot: {
    greet: "Oh la la, Monsieur, the police! I didn't do nothing, I swear on my mother.",
    suggest: ["You're not in trouble. What did you see?", 'Where were you at a quarter to twelve?', "What's the gossip about Madame Castellane?"],
    topics: [
      { k: ['not in trouble', 'promise', "won't report", 'protect', 'safe', 'trust', 'kind', 'fired', 'job', 'help me'], r: "You promise? ...Alright. I wasn't in the linen room. I was on the third. At ten to twelve a man came from the 304 end and ran into the service stairs. Dark suit, glasses, they flashed under the lamp. He was holding a handkerchief to his hand.", reveal: 's_margot_saw', mood: 'relieved', trust: 4 },
      { k: ['where', 'linen', 'quarter to', 'evening', 'eleven'], r: "In the linen room, folding towels. All night. Ask Monsieur Emile.", mood: 'nervous' },
      { k: ['helene', 'hélène', 'lucien', 'affair', 'gossip', 'madame'], r: "Everybody knows, Monsieur. Two glasses every morning in 305. And Monsieur Moreau's shoes outside the door, the silly man." },
      { k: ['arrest', 'prison', 'liar', 'lying', 'threat'], r: "I'm not saying nothing more without Monsieur Emile.", mood: 'defensive', trust: 1 },
    ],
    evidence: { e_carnation: { r: "That's Monsieur Moreau's. He always wears one for the gala." } },
    fallback: "I don't know, Monsieur, I just do the beds.",
  },
  helene: {
    greet: "Inspecteur. You will forgive me if I don't weep. I did all my weeping in 1947.",
    suggest: ['Where were you after eleven?', 'Did you hear anything from 304?', 'Tell me about the divorce.'],
    topics: [
      { k: ['where', 'eleven', 'evening', 'asleep', 'hear', 'heard', 'noise'], r: "I had a migraine. I took a powder at eleven and slept until that poor man came with the champagne." },
      { k: ['divorce', 'contract', 'money'], r: "Victor collected divorces the way he collected prizes. He would never have gone through with it. Too expensive.", mood: 'defensive' },
      { k: ['lucien', 'lover', 'affair'], r: "Lucien is a charming boy and a colleague. Voyons, Inspecteur.", mood: 'defensive' },
    ],
    evidence: {
      e_carnation: { r: "...Very well. Lucien was with me from eleven. I heard Solange shouting at Victor. And later, at twenty to twelve, a dreadful thud. I thought he had knocked over the whisky again.", reveal: 's_helene_affair', mood: 'grieving' },
      e_two_glasses: { r: "...Very well. Lucien was with me from eleven. I heard Solange shouting at Victor. And later, at twenty to twelve, a dreadful thud. I thought he had knocked over the whisky again.", reveal: 's_helene_affair', mood: 'grieving' },
      e_divorce_papers: { r: "Unsigned, Inspecteur. Victor never signed anything he could not take back." },
    },
    fallback: "Mon cher, I have no idea. Ask someone who was awake.",
  },
  lucien: {
    greet: "Inspecteur! Lucien Moreau. You've seen my films, of course. Terrible business. Terrible.",
    suggest: ['Who did Victor argue with tonight?', 'Where were you after eleven?', 'Your shoes are bone dry. Explain.'],
    topics: [
      { k: ['dry', 'shoes', 'jacket', 'wet', 'rain'], r: "My shoes? I... Alright! I was with Helene. In 305. Please, Inspecteur, if this gets out, Hollywood is finished for me.", reveal: 's_lucien_affair', mood: 'nervous' },
      { k: ['heard', 'corridor', 'fire', 'left', 'leave'], needs: 's_lucien_affair', r: "When I left at twenty to twelve, 304 was shut, but I heard a fire crackling inside. And paper tearing. Who lights a fire at midnight?", reveal: 's_lucien_fire' },
      { k: ['argue', 'quarrel', 'fight', 'bar', 'armand', 'petit', 'who', 'enemies'], r: "Victor fought with everyone. But at the bar, around half past ten, he stuck his finger in Petit's chest. 'Midnight, Petit. Or the police.' Petit went white as a napkin.", reveal: 's_lucien_bar' },
      { k: ['where', 'eleven', 'evening', 'walk', 'promenade'], r: "I walked on the Promenade. To clear my head. In the rain, yes, I'm a romantic.", mood: 'nervous' },
    ],
    evidence: { e_carnation: { r: "My carnation... Alright! I was with Helene. In 305. Please, if this gets out, Hollywood is finished for me.", reveal: 's_lucien_affair', mood: 'nervous' } },
    fallback: "Ha! Good question. I have no idea, Inspecteur.",
  },
  solange: {
    greet: "Duret. Solange. Ask your questions, Inspecteur, I have a cognac waiting.",
    suggest: ['Where were you after the dinner?', 'Did you see Victor tonight?', 'What do you think of Armand Petit?'],
    topics: [
      { k: ['armand', 'petit', 'money', 'accounts', 'books'], needs: 's_solange_visit', r: "Two months ago I caught Petit changing a budget line. He called it a 'correction'. Accountants do not correct upwards.", reveal: 's_solange_books' },
      { k: ['where', 'after', 'dinner', 'eleven', 'terrace'], r: "Straight from dinner to the terrace bar. Alone. With the storm, which is better company.", mood: 'defensive' },
      { k: ['victor', 'see', 'saw', 'shout', 'quarrel'], r: "I saw him at dinner, gloating. That was enough.", mood: 'defensive' },
    ],
    evidence: {
      e_script_pages: { r: "Fine. Yes. I went to 304 at five past eleven and told him what he was. He laughed. I tore the page and left at a quarter past. He was alive, drunk and delighted with himself.", reveal: 's_solange_visit', mood: 'angry' },
      e_bar_receipt: { r: "Twenty-three eighteen. You see? A woman of precise habits." },
    },
    fallback: "That is not a question, Inspecteur, it is a sentence with a hopeful tone.",
  },
};
