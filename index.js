#!/usr/bin/env node

const AlfrescoApi = require("alfresco-js-api-node");
const vorpal = require('vorpal')();
var fs = require('fs');
var AsciiTable = require('ascii-table')
var flatten = require('flat')
const _cliProgress = require('cli-progress');

let parseNodeRef = (nodeRef) => {
    return nodeRef;
}

let alfrescoJsApi = new AlfrescoApi({ provider:'ECM' });
let host = '';
let ticket = ''
vorpal
  .command('login <username> [password] [host]', 'Login to an Alfresco instance.')
  .option('-p', '--password', 'Password')
  .option('-h', '--host', "Host")
  .action(function(args, callback) {
    this.log('logging in..');
    let password;

    console.log(JSON.stringify(args));
    if(args.host){
        host = args.host;
        console.log("Updating host: " + args.host);
        vorpal.localStorage.setItem('host', args.host);
        alfrescoJsApi.changeEcmHost(host);
    }

    if(args.password){
        password = args.password;
    }else{
        //prompt for password
    }

    alfrescoJsApi.login(args.username, password).then(function (data) {
        console.log('API authentication performed successfully. Login ticket:' + data);
        vorpal.localStorage.setItem('ticket', data);
    }, function (error) {
        console.error(error);
        callback();
    });    
    callback();
  });


  vorpal
  .command('list-sites [info]', 'Lists all sites.')
  .option('-I --info', "Show all info for each site")
  .types({
      boolean: ['i', 'info']
  })
  .action(function(args, callback) {
    alfrescoJsApi.core.sitesApi.getSites().then(function(data) {
    console.log('API called successfully. Returned data for ' + data.list.entries.length + ' sites');
    let sites = data.list.entries.map((item) => {
        let i = {};
        if(args.options.info){
            i[item.entry.id] = item.entry;
        }else{
            i[item.entry.id] = item.entry.title + (item.entry.description ? " - "  + item.entry.description : "") ;
        }
        return i;
    })

    let rows = flatten(sites);
    var table = new AsciiTable();
    if(args.info){
        table.setHeading( 'site-id/property', 'value' );
    }else{
        table.setHeading( 'site-id', 'site-name' );
    }
    for(var key in rows){
        if(args.property){
            if(args.property == key){
                table.addRow(key, rows[key])
            }
        }else{
            table.addRow(key, rows[key]);
        }
    }

    console.log(table.toString());
    }, function(error) {
    console.error(error);
    });
    callback();
  });

  vorpal.command('list-people', "Lists all users in system.")
    .action(function(args, callback){
        alfrescoJsApi.core.peopleApi.getPersons().then(function(data) {
            console.log('API called successfully. Returned data for ' + data.list.entries.length + ' users.');
            
            //TODO: Add the user information table.
        }, function(error) {
            console.error(error);
        });
    });

  vorpal
  .command('debug', 'Debug current connection information.')
  .action(function(args, callback) {
    this.log('debug: ');
    this.log(JSON.stringify(alfrescoJsApi));
    callback();
  });

  
  vorpal
  .command('upload-file <destinationNodeRef> <filePath> [autoRename]', 'Uploads a file to the given destination.')
  .option('-arn', "--autoRename", "Automatically rename the file if a similarly named file exists.")
  .action(function(args, callback) {
      let ongoing = false;
      var fileToUpload = fs.createReadStream(args.filePath);
      const bar1 = new _cliProgress.Bar({}, _cliProgress.Presets.shades_classic);
      bar1.start();
    alfrescoJsApi.upload.uploadFile(fileToUpload, null, args.destinationNodeRef, null, {autoRename: args.options.autoRename})
    .on('progress', (progress) => {
        
        bar1.update(progress.percent);
        // console.log( 'Total :' + progress.total );
        // console.log( 'Loaded :' + progress.loaded );
        // console.log( 'Percent :' + progress.percent );
        // vorpal.ui.redraw('progress: ' + progress.percent);
    })
    .on('success', () => {
        bar1.stop();
        vorpal.ui.redraw.clear()
        console.log( 'Your File is uploaded');
        callback();
    })
    .on('abort', () => {
        bar1.stop();
        console.info( 'Upload Aborted');
        callback();
    })
    .on('error', () => {
        bar1.stop();
        console.log( 'Error during the upload');
        callback();
    })
    .on('unauthorized', () => {
        bar1.stop();
        console.log('You are unauthorized');
        callback();
    });
  
});

vorpal.command('view-metadata <nodeRef> [property]', "Shows metadata for the selected node.")
.option('-p','--property', 'Show only a particualr property.')
.alias('stat')
.action(function(args, callback){
    alfrescoJsApi.nodes.getNodeInfo(args.nodeRef).then(function (data) {
        console.log('Name: ' + data.name );
        let rows = flatten(data);
        var table = new AsciiTable();
        table.setHeading( 'property', 'value' );
        for(var key in rows){
            if(args.property){
                if(args.property == key){
                    table.addRow(key, rows[key])
                }
            }else{
                table.addRow(key, rows[key]);
            }
        }

        console.log(table.toString());

    }, function (error) {
        console.log('This node does not exist');
    });
    callback();
});

vorpal.command('move-node <nodeRef> <destinationNodeRef>', "Moves a node to a destination.")
.action(function(args, callback){
    alfrescoJsApi.nodes.moveNode(args[0])
});


vorpal.command("delete-node <nodeRef>", "Deletes a given node.")
  .action(function(args, callback){
      this.log('deleting node: ' + args.nodeRef)
      callback();
  });

vorpal.command("about", "About Alfresco CLI")
.action(function(args, callback){
    this.log("Alfresco CLI by Bhagya Nirmaan Silva (https://about.me/bhagyas) and other contributors.");
    callback();
});

vorpal.command("create-folder <folderName> <destinationNodeRef> [path]", "Create folder")
.option('-p', "--path", "Relative path from the destination nodeRef.")
.alias('mkdir')
.action(function(args, callback){
    alfrescoJsApi.nodes.createFolder(args.folderName, args.path, args.destinationNodeRef).then(function (data) {
        console.log('The folder is created.');
    }, function (error) {
        console.log('Error in creation of this folder or folder already exist' + error);
    });    
    callback();
});


let init = async () => {
    let ticket = vorpal.localStorage.getItem('ticket');
    let _host = vorpal.localStorage.getItem('host');
    try{
        if(ticket && _host){
            host = _host;
            alfrescoJsApi.changeEcmHost(_host);
            await alfrescoJsApi.loginTicket(ticket).then(function (data) {
                console.log("Automatically logged into host: " + host + " with ticket: " + ticket);
                console.log("If this is not intended, please logout from the terminal.");
            }, function (error) {
                throw error;
            });
        }else{
            throw new Error("Invalid login ticket.");
        }
    }catch (e){
        console.log("Please make sure you are logged in before issuing any commands.")
    }
};


vorpal.localStorage('alfresco-cli');
vorpal.history('alfresco-cli');

vorpal
  .delimiter('alfresco-cli$')
  .show();

init();
