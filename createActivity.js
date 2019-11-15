const Authenticator = require('./lib/authenticator');
const configFile = require('./config');
const ActivityCreator = require('./lib/activityCreator');
const fs = require('fs');
const handlebar = require('handlebars');
const logger = require('./lib/logger');

const postActivityTemplateFileContent = fs.readFileSync('./templates/payloads/postActivityExportToFBX.hbs', 'utf8');
const postActivityTemplate = handlebar.compile(postActivityTemplateFileContent);

const authenticator = new Authenticator(configFile.forge.clientId, configFile.forge.clientSecret);
authenticator.getForgeOAuth2TwoLeggedObject((err, forgeOAuth2TwoLegged) => {
    if (err) {
        logger.log('Error while initializing forgeOAuth2TwoLegged object: ', err);
        process.exit(1);
    }
    const ExportToFBXRunnerInstance = new ActivityCreator(forgeOAuth2TwoLegged, configFile);
    ExportToFBXRunnerInstance.createActivity({
        nickname: configFile.forge.nickname,
        appId: configFile.designAutomation.appId,
        appAlias: configFile.designAutomation.appAlias,
        activityId: configFile.designAutomation.activityId,
        activityAlias: configFile.designAutomation.activityAlias,
        engineId: configFile.designAutomation.engineId,
        clientId: configFile.forge.clientId,
        clientSecret: configFile.forge.clientSecret,
        activityPayloadTemplate: postActivityTemplate
    });
});

