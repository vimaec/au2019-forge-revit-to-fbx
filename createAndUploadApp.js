const AppCreator = require('./lib/appCreator');
const Authenticator = require('./lib/authenticator');
const configFile = require('./config/index');
const logger = require('./lib/logger');

const authenticator = new Authenticator(configFile.forge.clientId, configFile.forge.clientSecret);
authenticator.getForgeOAuth2TwoLeggedObject((err, forgeOAuth2TwoLegged) => {
    if (err) {
        logger.log('Error while initializing forgeOAuth2TwoLegged object: ', err);
        process.exit(1);
    }

    const ExportToFBXRunnerInstance = new AppCreator(forgeOAuth2TwoLegged, configFile);
    ExportToFBXRunnerInstance.createApp({
        appId: configFile.designAutomation.appId,
        appAlias: configFile.designAutomation.appAlias,
        engineId: configFile.designAutomation.engineId,
        clientId: configFile.forge.clientId,
        clientSecret: configFile.forge.clientSecret,
        pathToAppPackage: './appBundle/export.bundle'
    });
});
