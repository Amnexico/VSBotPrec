'use strict';
const { Telegraf, Scenes } = require('telegraf');
const LocalSession = require('telegraf-session-local');
const scenes = require('./scenes');
const commands = require('./commands');
const actions = require('./actions');
const errorHandler = require('./error-handler');
const localization = require('../locales');

const stage = new Scenes.Stage(Object.values(scenes));
const session = new LocalSession();

class Bot extends Telegraf {
  constructor(token, options) {
    super(token, options);
    this.use(session.middleware());
    this.use(stage.middleware());
    this.catch(errorHandler);
    
    // Comando start con multiidioma
    this.start(async ctx => {
      const userId = ctx.from.id;
      const welcomeMsg = await this.getWelcomeMessage(userId);
      await ctx.replyWithMarkdown(welcomeMsg);
    });
    
    this.command('track', commands.track);
    this.command('list', commands.list);
    this.command('language', commands.language);
    
    this.action('!list', actions.list);
    this.action(/^!menu=(\w+)$/, actions.menu);
    this.action(/^!remove\?id=(\w+)$/, actions.remove);
    this.action(/^!availability\?id=(\w+)&value=(\w+)$/, actions.availability);
    this.action(/^!price\?id=(\w+)$/, actions.price);
    this.action(/^!language=(\w+)$/, actions.language);
  }

  async getWelcomeMessage(userId) {
    const title = await localization.getText('welcome.title', userId);
    const description = await localization.getText('welcome.description', userId);
    const commandsTitle = await localization.getText('welcome.commands_title', userId);
    const trackCommand = await localization.getText('welcome.track_command', userId);
    const listCommand = await localization.getText('welcome.list_command', userId);
    const languageCommand = await localization.getText('welcome.language_command', userId);
    
    return `${title}\n\n${description}\n\n${commandsTitle}\n\n${trackCommand}\n${listCommand}\n${languageCommand}`;
  }

  sendMessage(user, message) {
    // eslint-disable-next-line
    this.telegram.sendMessage(user, message, { 
      parse_mode: 'Markdown', 
      disable_web_page_preview: true 
    });
  }
}

module.exports = Bot;
