import * as AlfrescoApi from 'alfresco-js-api-node';
import {PersonBodyCreate, SiteBody} from 'alfresco-js-api-node';
import * as Vorpal from 'vorpal';
// @ts-ignore
import * as fs from 'fs';
import * as fsAutocomplete from 'vorpal-autocomplete-fs';
import * as flatten from "flat";
import * as _cliProgress from "cli-progress";
import chalk = require('chalk');
import  AsciiTable = require("ascii-table");
import {throws} from "assert";

let parseNodeRef = (nodeRef?: string) => {
    return nodeRef;
};

let alfrescoJsApi = new AlfrescoApi({provider: 'ECM'});
let host = '';
let ticket = '';

const vorpal = new Vorpal();


let nodeNameAutoCompletion = async (input, callback) => {
    try {
        let currentNodeRef = getCurrentNodeRef();
        return await alfrescoJsApi.nodes.getNodeChildren(currentNodeRef).then(
            data => {
                let list =  data.list.entries.map(entry => {
                    return entry.entry.name
                });
                list.push('.', '..');
                return list;
            }
        )
    } catch (e) {
        vorpal.log("Unable to find current node location for auto completion.");
    }
};


vorpal
    .command('login <username> [password] [host]', 'Login to an Alfresco instance.')
    .option('-p', '--password', 'Password')
    .option('-h', '--host', "Host")
    .action(function (args, callback) {
        let self = this;
        self.log(chalk.default.green('logging in..'));
        let password;

        self.log(JSON.stringify(args));
        if (args.host) {
            host = args.host;
            this.log("Updating host: " + args.host);
            vorpal.localStorage.setItem('host', args.host);
            alfrescoJsApi.changeEcmHost(host);
        }

        if (args.password) {
            password = args.password;
        } else {
            //prompt for password
        }

        alfrescoJsApi.login(args.username, password).then(function (data) {
            self.log('API authentication performed successfully. Login ticket:' + data);
            vorpal.localStorage.setItem('ticket', data);
        }, function (error) {
            vorpal.log(error);
        }).then(callback);
    });


vorpal.command('change site <siteName>', 'Change into a site.')
    .alias('cd-site')
    .action((args, callback) => {
        alfrescoJsApi.core.sitesApi.getSites().then(function (data) {
            vorpal.log('API called successfully. Returned data for ' + data.list.entries.length + ' sites');
            data.list.entries.filter((item) => {
                return item.entry.id === args.siteName
            }).map(item => item.entry).forEach(
                (entry) => {
                    updateCurrentNodeRef(entry.guid, callback);
                }
            );
        }, function (error) {
            vorpal.error(error);
        }).then(callback);
    });

vorpal
    .command('list sites [info]', 'Lists all sites.')
    .option('-I --info', "Show all info for each site")
    .types({
        boolean: ['i', 'info']
    })
    .action(function (args, callback) {
        let self = this;
        alfrescoJsApi.core.sitesApi.getSites().then(function (data) {
            self.log('API called successfully. Returned data for ' + data.list.entries.length + ' sites');
            let sites = data.list.entries.map((item) => {
                let i = {};
                if (args.options.info) {
                    i[item.entry.id] = item.entry;
                } else {
                    i[item.entry.id] = item.entry.title + (item.entry.description ? " - " + item.entry.description : "");
                }
                return i;
            })

            let rows = flatten(sites);
            var table = new AsciiTable();
            if (args.info) {
                table.setHeading('site-id/property', 'value', "id");
            } else {
                table.setHeading('site-id', 'site-name', "id");
            }
            for (var key in rows) {
                if (args.property) {
                    if (args.property == key) {
                        table.addRow(key, rows[key])
                    }
                } else {
                    table.addRow(key, rows[key]);
                }
            }

            self.log(table.toString());
        }, function (error) {
            vorpal.log(error);
        }).then(callback);
    });

vorpal.command('list people', "Lists all users in system.")
    .action(function (args, callback) {
        let self = this;
        alfrescoJsApi.core.peopleApi.getPersons().then(function (data) {
            self.log('API called successfully. Returned data for ' + data.list.entries.length + ' users.');

            //TODO: Add the user information table.
        }, function (error) {
            vorpal.log(error);
        }).then(callback);
    });

vorpal
    .command('debug', 'Debug current connection information.')
    .action(function (args, callback) {
        this.log('debug: ');
        this.log(JSON.stringify(alfrescoJsApi));
        callback();
    });

vorpal.command('list parents [nodeRef]', 'Lists parents for a given nodeRef.')

    .action(function (args, cb) {
            // alfrescoJsApi.nodes.getParents(args.nodeRef).then((data) => {
            //     data.list.entries.forEach(entry => {
            //         this.log(entry.entry.nodeId)
            //     })
            // }).then(() => {
            //     cb();
            // })
            let self = this;

            getNodeRef(args.nodeRef).then(nodeRef => {
                return alfrescoJsApi.core.childAssociationsApi.listParents(nodeRef, {})
                    .then(function (data) {
                        // @ts-ignore
                        self.log('API called successfully. ' + data.list.pagination.totalItems + ' parent(s) found.');
                        printNodeList(data.list.entries);
                    }, function (error) {
                        vorpal.log(error);
                    });
            }).then(cb);

        }
    );

vorpal
    .command('upload <filePath> <destinationNodeRef> [relativePath] [autoRename]', 'Uploads a file to the given destination.')
    .option('-arn', "--autoRename", "Automatically rename the file if a similarly named file exists.")
    .action(function (args, callback) {
        let ongoing = false;
        let self = this;
        let fileToUpload = fs.createReadStream(args.filePath);
        const bar1 = new _cliProgress.Bar({}, _cliProgress.Presets.shades_classic);
        bar1.start(0, 0, null);
        getNodeRef(args.destinationNodeRef).then(destinationNodeRef => {
            let upload = alfrescoJsApi.upload.uploadFile(fileToUpload, args.relativePath, destinationNodeRef, null, {autoRename: args.options.autoRename})
                .on('progress', (progress) => {

                    bar1.update(progress.percent);
                    // this.log( 'Total :' + progress.total );
                    // this.log( 'Loaded :' + progress.loaded );
                    // this.log( 'Percent :' + progress.percent );
                    // vorpal.ui.redraw('progress: ' + progress.percent);
                })
                .on('success', () => {
                    bar1.stop();
                    vorpal.ui.redraw.clear()
                    self.log('Your File is uploaded');

                })
                .on('abort', () => {
                    bar1.stop();
                    self.log('Upload Aborted');
                })
                .on('error', () => {
                    bar1.stop();
                    self.log('There was an error during the upload');
                })
                .on('unauthorized', () => {
                    bar1.stop();
                    self.log('You are unauthorized');
                });

            upload.then(() => {
                callback();
            }).catch(() => {
                callback();
            });
        });
    })
    .autocomplete(fsAutocomplete());

vorpal.command('view-metadata [nodeRef] [property]', "Shows metadata for the selected node.")
    .option('-p', '--property', 'Show only a particualr property.')
    .alias('info')
    .alias('stat')
    .autocomplete({data: nodeNameAutoCompletion})
    .action(function (args, callback) {
        let self = this;
        getNodeRef(args.nodeRef).then(nodeRef => {
            alfrescoJsApi.nodes.getNodeInfo(nodeRef).then(function (data) {
                self.log('name: ' + data.name);
                let rows = flatten(data);
                var table = new AsciiTable();
                table.setHeading('property', 'value');
                for (var key in rows) {
                    if (args.property) {
                        if (args.property == key) {
                            table.addRow(key, rows[key])
                        }
                    } else {
                        table.addRow(key, rows[key]);
                    }
                }

                self.log(table.toString());
            }, function (error) {
                self.log('This node does not exist');
            });
        }).then(callback);
    });

vorpal.command('move <nodeRef> <destinationNodeRef>', "Moves a node to a destination.")
    .autocomplete({data: nodeNameAutoCompletion})
    .action(function (args, callback) {
        alfrescoJsApi.nodes.moveNode(args[0])
    });

vorpal.command("about", "About Alfresco CLI")
    .action(function (args, callback) {
        this.log("Alfresco CLI by Bhagya Nirmaan Silva (https://about.me/bhagyas)");
        callback();
    });

vorpal.command('create site <siteId> [title] [description]', "Creates a site (Visibility PUBLIC by default)")
    .action((args, callback) => {
        let self = this;
        let siteBody = {
            id: args.siteId,
            description: args.description,
            title: args.title,
            visibility: 'PUBLIC'
        };
        // @ts-ignore
        alfrescoJsApi.core.sitesApi.createSite(siteBody, {skipAddToFavorites: false, skipConfiguration: false})
            .then(() => {
                vorpal.log("Site created successfully.");
            }).catch((e) => {
            vorpal.log(`There was an error creating the site: ${e.message}` );
        }).then(callback);

    });

vorpal.command("create person <userName> <password> [email] [firstName] [lastName]", "Creates a new user.")
    .action((args, callback) => {
        let self = this;
        var person: PersonBodyCreate = {
            id: args.userName,
            password: args.password,
            firstName: args.firstName,
            lastName: args.lastName,
            email: args.email,
            properties: null
        };
        alfrescoJsApi.core.peopleApi.addPerson(person).then(
            result => {
                vorpal.log("Successfully created user.")
                vorpal.log(JSON.stringify(result));
            }
        ).catch(e => {
            vorpal.log("Unable to create person.");
            vorpal.log(e)
        }).then(callback);
    });

vorpal.command('list versions <nodeRef>')
    .action((args, callback) => {
        getNodeRef(args.nodeRef).then(nodeId => {
            alfrescoJsApi.core.versionsApi.listVersionHistory(nodeId, {}).then(function(data) {
                printNodeList(data.list.entries);
            }, function(error) {
                vorpal.log(error);
            }).then(callback)
        })
    });


vorpal.command("create folder <folderName> <destinationNodeRef> [path]", "Create folder at the destination.")
    .option('-p', "--path", "Relative path from the destination nodeRef.")
    .alias('mkdir')
    .action(function (args, callback) {
        let self = this;
        getNodeRef(args.destinationNodeRef).then(destinationNodeRef => {
            return alfrescoJsApi.nodes.createFolder(args.folderName, args.path, destinationNodeRef).then(function (data) {
                self.log('The folder is created.');
            }, function (error) {
                self.log('Error in creation of this folder or folder already exist' + error);
            }).catch(e => self.log(e.message));
        }).then(callback);
    });

let init = async () => {
    let ticket = vorpal.localStorage.getItem('ticket');
    let _host = vorpal.localStorage.getItem('host');
    try {
        if (ticket && _host) {
            host = _host;
            alfrescoJsApi.changeEcmHost(_host);
            await alfrescoJsApi.loginTicket(ticket).then(function (data) {
                vorpal.log("Automatically logged into host: " + host + " with ticket: " + ticket);
                vorpal.log("If this is not intended, please logout from the terminal.");
            }, function (error) {
                throw error;
            });
        } else {
            throw new Error("Invalid login ticket.");
        }
    } catch (e) {
        vorpal.log("You are not logged in. Please make sure you are logged in before issuing any commands.")
    }
};

const error = chalk.default.keyword('red');
const warning = chalk.default.keyword('orange');
const info = chalk.default.keyword('blue');

vorpal.command('search <query> [language]', "Searches the repostitory for content.")
    .action(function (args, callback) {
        let self = this;

        if (!args.language) {
            self.log(info("You have not set a language, using alfresco full text search syntax (AFTS)."))
        }

        alfrescoJsApi.search.searchApi.search({
            "query": {
                "query": args.query,
                "language": args.language ? args.language : "afts"
            }
        }).then(function (data) {
            printNodeList(data.list.entries)
        }, function (error) {
            self.log(error);
        }).catch(() => {

        });
        callback();
    });

function printNodeList(entries) {
    var table = new AsciiTable();
    table.setHeading('id', 'name', "type");
    entries.forEach(item => {
        table.addRow(item.entry.id, item.entry.name, item.entry.nodeType);
    });
    vorpal.log(table.toString());
}

async function getParent(nodeRef) {
    vorpal.log("getting parent for nodeRef: " + nodeRef);
    let _nodeRef = await getNodeRef(nodeRef);
    return await alfrescoJsApi.core.childAssociationsApi.listParents(_nodeRef)
        .then(function (data) {
            vorpal.log('Getting parent.. API called successfully. ' + data.list.pagination.totalItems + ' parent(s) found.');
            let element = data.list.entries[0].entry;
            return element.id;
        }).catch(data => {
            vorpal.log(data);
            throw new Error("Unable to find parent.")
        });
}


vorpal.command("change node [nodeRef]", "Change into a nodeRef")
    .alias('cd')
    .autocomplete({data: nodeNameAutoCompletion})
    .action(function (args, callback) {
        let self = this;
        getNodeRef(args.nodeRef).then(nodeRef => {
            updateCurrentNodeRef(nodeRef, callback);
        }).catch(e => () => {
            self.log(e.message);
            callback();
        });
    });

vorpal.command('clear', "Clears the current node context.")
    .alias('cls')
    .action((args, callback) => {
        updateCurrentNodeRef("", callback);
    });


function updateCurrentNodeRef(nodeRef, after) {
    vorpal.localStorage.setItem('currentNodeRef', nodeRef);
    vorpal.log(vorpal.localStorage.getItem('currentNodeRef'));
    getDelimiter()
        .then((del) => {
                vorpal.delimiter(del)
            }
        ).then(after);
    ;
}
vorpal.command('undo delete', "Undoes the last delete.")
    .action((args, callback) => {
        let lastDeleted = vorpal.localStorage.getItem('lastDeleted');
        if (lastDeleted){
            vorpal.log(info(`attempting to restore last deleted node: ${lastDeleted}`))
            alfrescoJsApi.nodes.restoreNode(lastDeleted).then(
                vorpal.localStorage.removeItem('lastDeleted')
            ).catch().then(callback);
        } else{
            vorpal.log(warning('There was no last deleted nodeRef available.'));
            callback();
        }
    });

vorpal.command('delete <nodeRef> [nodeRefPattern] [force]', 'Deletes a nodeRef matching a pattern')
    .alias('rm')
    .option('-f, --force', "Force deletion (no prompt)")
    .option('-p, --permanent', "Delete file permanently (Skip trashing)")
    .autocomplete({data: nodeNameAutoCompletion})
    .action(function (args, callback){
        const self = this;

        let deleteNode = (nodeRef) => {
            vorpal.log(`Attempting to delete node: ${nodeRef}`);
            let permanent = args.options.permanent;
            let deleteOp = alfrescoJsApi.core.nodesApi.deleteNode(nodeRef);
            return deleteOp.then(
                () => {
                    if (permanent){
                        //purge the deleted node
                        vorpal.log(info('purging deleted node..'));
                        return alfrescoJsApi.core.nodesApi.purgeDeletedNode(nodeRef);
                    }
                    vorpal.ui.redraw.clear();
                    vorpal.log(info('setting last deleted value...' + nodeRef))
                    vorpal.localStorage.setItem('lastDeleted', nodeRef);
                    vorpal.log(`Node ${nodeRef} successfully deleted.`);
                }
            ).then().catch(e => {
                vorpal.ui.redraw.clear();
                vorpal.log(`There was an error deleting node : ${nodeRef}, reason: ${e.message.briefSummary}`)
            })
        };

        let op = async () => {
                //get all children
                let f: any;

                if (args.nodeRefPattern) {
                    if (args.nodeRefPattern == "*") {
                        vorpal.log(info(`looking for children of the specified node with pattern: ${args.nodeRefPattern}`))
                        f = getNodeRef(args.nodeRef, true).then(nodeRef => {
                            return alfrescoJsApi.core.nodesApi.getNodeChildren(nodeRef).then(
                                value => {
                                    value.list.entries.forEach(entry => {
                                        deleteNode(entry.entry.id);
                                    });
                                }
                            ).then(callback)
                        });
                    }else{
                        //throw error or show there are no results for pattern.
                    }
                }else{
                    f = getNodeRef(args.nodeRef, true)
                        .then(nodeRef => {
                            vorpal.log(info("deleting node..."))
                            return deleteNode(nodeRef);
                        });
                }

                return f.catch(e => {
                    vorpal.log(error(e.message))
                    return e;
                }).then(message => {
                    // vorpal.log(message);
                    callback();
                })
        };

        if (args.options.force){
            vorpal.log(warning('You are forcing deletion. The file will be deleted without confirmation.'))
            op().then(callback);
        }else{
            return this.prompt({
                type: 'confirm',
                name: 'continue',
                default: false,
                message: 'Do you wish to delete the node(s) specified. Continue?',
            }, function(result){
                if (!result.continue) {
                    self.log('Operation cancelled.');
                    callback();
                } else {
                    self.log('Deleting node(s)..');
                    op().then(callback);
                }
            });
        }
    });

vorpal.command('list children [nodeRef]', "List all children of a given folder.")
    .alias('ls')
    .autocomplete({data: nodeNameAutoCompletion})
    .action(function (args, callback) {
        let self = this;
        let list = async (nodeRef) => {
            self.log(`listing children for nodeRef : ${nodeRef}`);
            await alfrescoJsApi.nodes.getNodeChildren(nodeRef).then(function (data) {
                let count = data.list.pagination.count;

                if (count > 0) {
                    printNodeList(data.list.entries);
                    self.log('The number of children in this folder are ' + count);
                } else {
                    self.log("No children found.")
                }
            }, function (error) {
                self.log('This node does not exist');
            });
        };

        getNodeRef(args.nodeRef)
            .then(nodeRef => list(nodeRef))
            .catch((error) => self.log(error.message))
            .then(callback);
    });

vorpal.localStorage('alfresco-cli');
vorpal.history('alfresco-cli');

function getCurrentNodeRef() {
    let nodeRef = vorpal.localStorage.getItem('currentNodeRef');

    if (!nodeRef) {
        throw new Error("Unable to find current nodeRef.");
    }

    return nodeRef;
}

async function getNodeRef(nodeRef: string, explicit = false):Promise<string> {
    let storedNodeRef = getCurrentNodeRef();

    if (nodeRef === "..") {
        return await getParent(storedNodeRef);
    }

    if (nodeRef === ".") {
        return storedNodeRef;
    }

    if (nodeRef) {
        //look under children first, if not look up as a node.
        return alfrescoJsApi.nodes.getNodeChildren(storedNodeRef).then(data => {
            let nodeId = data.list.entries.filter(node => {
                return (node.entry.name.toLowerCase().trim() === nodeRef.toLowerCase().trim())
            }).map(entry => {
                return entry.entry.id
            })[0];

            if (nodeId) {
                return nodeId;
            } else {
                throw new Error("Unable to find a node with the matching name.");
            }
        }).catch(() => {
            return alfrescoJsApi.nodes.getNodeInfo(nodeRef).then(function (data) {
                vorpal.log(info(`Validated node [id=${data.id}][name=${data.name}]`));
                return nodeRef;
            }).catch((error)=> {
                if (explicit){
                    return Promise.reject(new Error("Unable to find an exact node match for the specified operation."));
                }else{
                    vorpal.log(info('This node does not exist. Trying context...'));
                    return storedNodeRef;
                }
            })
        })
    }

    if (!explicit){
        return storedNodeRef;
    }else{
        throw new Error("Unable to find a matching nodeRef.")
    }
}

async function getDelimiter() {
    let item;
    try {
        item = getCurrentNodeRef();
        return `alfresco-cli:${item}$`;
    } catch (error) {
        return `alfresco-cli$`;
    }
}

init().then(() => {
    getDelimiter().then(result => {
        vorpal.delimiter(result).show();
    })
});



