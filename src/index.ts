import * as AlfrescoApi from 'alfresco-js-api-node';
import {NodeEntry, PersonBodyCreate} from 'alfresco-js-api-node';
import * as Vorpal from 'vorpal';
// @ts-ignore
import * as fs from 'fs';
import * as fsAutocomplete from 'vorpal-autocomplete-fs';
import * as flatten from "flat";
import * as _cliProgress from "cli-progress";
import chalk = require('chalk');
import AsciiTable = require("ascii-table");
import prettyjson = require('prettyjson');
import braces = require('braces');
import mm = require('micromatch');

let parseNodeRef = (nodeRef?: string) => {
    return nodeRef;
};

let alfrescoJsApi = new AlfrescoApi({provider: 'ECM'});
let host = '';
let ticket = '';

const vorpal = new Vorpal();

let siteNameAutoCompletion = async (input, callback) => {
    let sites =  await alfrescoJsApi.core.sitesApi.getSites().catch(
        vorpal.log('Unable to find sites for listing.')
    );
    let results = [];
    sites.list.entries.map(entry => {
        results.push(entry.entry.id);
    });
    return results;
};

let nodeNameAutoCompletion = async (input, callback) => {
    try {
        let currentNodeRef = getCurrentNodeRef();
        return await alfrescoJsApi.nodes.getNodeChildren(currentNodeRef).then(
            data => {
                let list = data.list.entries.map(entry => {
                    return entry.entry.name
                });

                list.push('.', '..');

                let resultsHistory = vorpal.localStorage.getItem('resultsHistory') ? JSON.parse(vorpal.localStorage.getItem('resultsHistory')) : [];
                if (resultsHistory) {
                    list.push(resultsHistory);
                }

                return list;
            }
        )
    } catch (e) {
        vorpal.log("Unable to find current node location for auto completion.");
    }
};


vorpal
    .command('login <username>', 'Login to an Alfresco instance.')
    .option('-p, --password <password>', 'Password')
    .option('-h, --host <host>', "Host")
    .option('-s, --save', "Save host")
    .action(function (args, callback) {
        let self = this;
        self.log(chalk.default.green('logging in..'));
        let loginToAlfresco = (username, password) => {
            return new Promise((resolve, reject) => {
                return alfrescoJsApi.login(username, password)
                    .then(function (data) {
                        self.log('API authentication performed successfully. Login ticket:' + data);
                        vorpal.localStorage.setItem('ticket', data);
                        resolve();
                    }, function (data) {
                        let error = JSON.parse(data.response.text).error.briefSummary;
                        reject(error);
                    }).catch(error => reject(error));
            })
        };

        let getParameter = (parameter, type = 'input') => {
            return new Promise((resolve, reject) => {
                let storedValue = vorpal.localStorage.getItem(parameter);
                if (storedValue) {
                    return resolve(storedValue);
                }

                if (args[parameter]) {
                    return resolve(args[parameter]);
                }
                if (args.options[parameter]) {
                    return resolve(args.options[parameter]);
                } else {
                    return self.prompt({
                        type: type,
                        name: parameter,
                        default: null,
                        message: `Please enter the ${parameter}: `,
                    }, results => {
                        let result = results[parameter];
                        if (result) {
                            resolve(result);
                        } else {
                            reject('Please try again.')
                        }
                    }, error => {
                        reject(error);
                    });
                }
            });
        };

        let updateHost = async (host) => {
            this.log(`Using host: ${host}. Change host by passing host as an argument.`);
            alfrescoJsApi.changeEcmHost(host);

            if (args.options.save) {
                vorpal.localStorage.setItem('host', host);
            }
        };

        let authenticate = new Promise((resolve, reject) => {
            return getParameter('host').then((host => {
                return updateHost(host).then(() => {
                    return getParameter('password', 'password').then(password => {
                        return loginToAlfresco(args.username, password).then(() => {
                            return resolve();
                        }).catch(reject);
                    }).catch(reject)
                });
            }));
        });

        authenticate.catch(callback).then(callback);
    });


vorpal.command('change site <siteName>', 'Change into a site.')
    .alias('cd-site')
    .autocomplete({data: siteNameAutoCompletion})
    .action((args, callback) => {
        alfrescoJsApi.core.sitesApi.getSites().then(function (data) {
            vorpal.log('API called successfully. Returned data for ' + data.list.entries.length + ' sites');
            data.list.entries.filter((item) => {
                return item.entry.id === args.siteName
            }).map(item => item.entry).forEach(
                (entry) => {
                    updateCurrentNodeRef(entry.guid).then(callback);
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
            printNodeList(data.list.entries, ['id', 'guid', 'title', 'description']);
            cacheResults(data.list.entries, ['guid']);
        }, function (error) {
            vorpal.log(error);
        }).then(callback);
    });

vorpal.command('list people', "Lists all users in system.")
    .action(function (args, callback) {
        let self = this;
        alfrescoJsApi.core.peopleApi.getPersons().then(function (data) {
            self.log('API called successfully. Returned data for ' + data.list.entries.length + ' users.');
            printNodeList(data.list.entries, ['id', 'firstName', 'lastName', 'email']);
            //TODO: Add the user information table.
        }, function (error) {
            vorpal.log(error);
        }).then(callback);
    });

vorpal
    .command('cls', 'Clear the screen.')
    .action(function(args, callback) {
        this.log('\u001B[2J');
        callback();
    });

vorpal
    .command('debug', 'Debug current connection information.')
    .option('-p, --pretty', "Format information to be more human readable.")
    .types({
        boolean: ['p', 'pretty']
    })
    .action(function (args, callback) {
        if (args.options.pretty) {
            this.log(prettyjson.render(alfrescoJsApi));
        } else {
            this.log('debug: ');
            this.log(JSON.stringify(alfrescoJsApi));
        }
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

            getNodeRefContext(args.nodeRef).then(nodes => {
                nodes.forEach(nodeRef => {
                    return alfrescoJsApi.core.childAssociationsApi.listParents(nodeRef, {})
                        .then(function (data) {
                            // @ts-ignore
                            self.log('API called successfully. ' + data.list.pagination.totalItems + ' parent(s) found.');
                            printNodeList(data.list.entries);
                        }, function (error) {
                            vorpal.log(error);
                        });
                })
            }).then(cb);

        }
    );

vorpal
    .command('upload <filePath> <destinationNodeRef> [relativePath] [autoRename]', 'Uploads a file to the given destination.')
    .option('-arn', "--autoRename", "Automatically rename the file if a similarly named file exists.")
    .action(function (args, callback) {
        let ongoing = false;
        let self = this;
        braces.expand(args.filePath).forEach(filePath => {
            let fileToUpload = fs.createReadStream(filePath);
            const bar1 = new _cliProgress.Bar({}, _cliProgress.Presets.shades_classic);
            bar1.start(0, 0, null);
            getNodeRefContext(args.destinationNodeRef).then(nodes => {
                nodes.forEach(destinationNodeRef => {
                    alfrescoJsApi.upload.uploadFile(fileToUpload, args.relativePath, destinationNodeRef, null, {autoRename: args.options.autoRename})
                        .on('progress', (progress) => {

                            bar1.update(progress.percent);
                            // this.log( 'Total :' + progress.total );
                            // this.log( 'Loaded :' + progress.loaded );
                            // this.log( 'Percent :' + progress.percent );
                            // vorpal.ui.redraw('progress: ' + progress.percent);
                        })
                        .on('success', () => {
                            bar1.stop();
                            vorpal.ui.redraw.clear();
                            self.log('Your File is uploaded');
                        })
                        .on('abort', () => {
                            bar1.stop();
                            self.log('Upload Aborted');
                        })
                        .on('error', (e) => {
                            bar1.stop();
                            self.log('There was an error during the upload, reason: ' + JSON.stringify(e.message));
                        })
                        .on('unauthorized', () => {
                            bar1.stop();
                            self.log('You are unauthorized');
                        }).then().catch(e => vorpal.log(e.message));
                });
            }).then(callback);
        })
    })
    .autocomplete(fsAutocomplete());

vorpal.command('view-metadata [nodeRef] [property]', "Shows metadata for the selected node.")
    .option('-p', '--property', 'Show only a particualr property.')
    .alias('info')
    .alias('stat')
    .autocomplete({data: nodeNameAutoCompletion})
    .action(function (args, callback) {
        let self = this;
        getNodeRefContext(args.nodeRef).then(nodes => {
            nodes.forEach(nodeRef => {
                alfrescoJsApi.nodes.getNodeInfo(nodeRef).then(function (data) {
                    self.log('name: ' + data.name);
                    let rows = flatten(data);
                    let table = new AsciiTable();
                    table.setHeading('property', 'value');
                    for (let key in rows) {
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
            vorpal.log(`There was an error creating the site: ${e.message}`);
        }).then(callback);

    });

vorpal.command("create person <userName> <password> [email] [firstName] [lastName]", "Creates a new user.")
    .action((args, callback) => {
        let self = this;
        let person: PersonBodyCreate = {
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
        getNodeRefContext(args.nodeRef).then(nodes => {
            nodes.forEach(nodeId => {
                alfrescoJsApi.core.versionsApi.listVersionHistory(nodeId, {}).then(function (data) {
                    printNodeList(data.list.entries);
                }, function (error) {
                    vorpal.log(error);
                })
            })
        }).then(callback).catch(callback)
    });

interface Alias {
    alias: string;
    expanded: string;
}

vorpal.command('alias set <alias> <expanded>', 'Sets an alias for an argument/search query')
    .action((args, callback) => {
        let aliases = getAllAliases();

        //if found, update
        if (getAlias(args.alias)) {
            //get all aliases except this one.
            aliases = aliases.filter(item => {
                return item.alias != args.alias;
            })
        }

        let alias: Alias = {alias: args.alias, expanded: args.expanded};
        aliases.push(alias);

        vorpal.localStorage.setItem('aliases', JSON.stringify(aliases));
        //known issue, need to handle setting existing alias.
        callback();
    });

vorpal.command('alias clear', 'Clears all aliases that have been set.')
    .action((args, callback) => {
        vorpal.localStorage.removeItem('aliases');
        callback();
    });

function getAllAliases(): Array<Alias> {
    return vorpal.localStorage.getItem('aliases') ? JSON.parse(vorpal.localStorage.getItem('aliases')) : [];
}

function getAlias(alias): Alias {
    let aliases = getAllAliases();
    let filterElement: Alias = aliases.filter(aliasItem => {
        return aliasItem.alias == alias
    })[0];
    return filterElement;
}

function getAliasString(alias): string {
    let foundAlias = getAlias(alias);
    if (foundAlias) {
        return foundAlias.expanded;
    } else {
        throw new Error(`Unable to find matching alias for '${alias}'.`)
    }
}

vorpal.command("create folder <folderName> [destinationNodeRef] [path]", "Create folder at the destination.")
    .option('-p, --path', "Relative path from the destination nodeRef.")
    .alias('mkdir')
    .action(function (args, callback) {
        let self = this;
        getNodeRefContext(args.destinationNodeRef).then(nodesList => {
            nodesList.forEach(destinationNodeRef => {
                return braces.expand(args.folderName).forEach(folderName => {
                    return alfrescoJsApi.nodes.createFolder(folderName, args.path, destinationNodeRef).then(function (data) {
                        self.log(`Folder ${folderName} is created.`);
                    }, function (error) {
                        self.log('Error in creation of this folder or folder already exist' + error);
                    }).catch(e => self.log(e.message));
                })
            });
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
const info = chalk.default.keyword('gray');

vorpal.command('search <query> [language] [alias]', "Searches the repostitory for content.")
    .option('-a, --alias', 'Use search query alias')
    .action(function (args, callback) {
        let self = this;

        if (!args.language) {
            self.log(info("You have not set a language, using alfresco full text search syntax (AFTS)."))
        }


        let query: string;
        try {
            query = args.options.alias ? getAliasString(args.query) : args.query;
            alfrescoJsApi.search.searchApi.search({
                "query": {
                    "query": query,
                    "language": args.language ? args.language : "afts"
                }
            }).then(function (data) {
                printNodeList(data.list.entries);
                cacheResults(data.list.entries);
            }, function (error) {
                self.log(error);
            }).catch(() => {

            }).then(callback);
        } catch (e) {
            vorpal.log(e.message);
            callback();
        }
    });

function printNodeList(entries, parameters=['id', 'name', 'type']) {
    let table = new AsciiTable();
    table.setHeading(parameters);
    //clear the results history
    vorpal.localStorage.removeItem('resultsHistory');
    let found = false;
    entries.forEach(item => {
        found = true;
        let row = parameters.map(
            param => {
                return item.entry[param];
            }
        );
        table.addRow(row);
    });
    if (found) {
        vorpal.log(table.toString());
    }
    else {
        vorpal.log(`no results`)
    }
}

function cacheResults(entries, parameters=['id']) {
    vorpal.localStorage.removeItem('resultsHistory');
    try{
        entries.forEach(item => {
            //add the results to the history.
            let resultsHistory = vorpal.localStorage.getItem('resultsHistory');
            parameters.forEach(param => {
                vorpal.localStorage.setItem('resultsHistory',
                    JSON.stringify(resultsHistory ?
                        JSON.parse(resultsHistory).push(item.entry[param]) : [item.entry[param]]))
            })
        })
    }catch (e) {
        vorpal.localStorage.removeItem('resultsHistory');
    }
;
}

/**
 * Returns the first parent on a nodeRef.
 * @param nodeRef
 */
async function getParent(nodeRef): Promise<string>{
    vorpal.log("getting parent for nodeRef: " + nodeRef);
    return alfrescoJsApi.core.childAssociationsApi.listParents(nodeRef)
        .then(function (data) {
            vorpal.log('Getting parent.. API called successfully. ' + data.list.pagination.totalItems + ' parent(s) found.');
            let element = data.list.entries[0].entry;
            return element.id;
        }).catch(data => {
            if(debugEnabled) {
                vorpal.log("unable to find parent:" + data);
            }
            throw new Error("Unable to find parent.")
        });
}

let debugEnabled = false;

vorpal.command("change node [nodeRef]", "Change into a nodeRef")
    .alias('cd')
    .autocomplete({data: nodeNameAutoCompletion})
    .action(function (args, callback) {
        let self = this;
        if(debugEnabled ){
            vorpal.log('attempting changing into node: ' + (args.nodeRef ? args.nodeRef : "<current>"));
        }
        getNodeRefContext(args.nodeRef).then(nodeRef => {
            updateCurrentNodeRef(nodeRef[0]);
        }).catch(e => () => {
            self.log(e.message);
        }).catch(callback).then(callback);
    });

vorpal.command('clear', "Clears the current node context and history.")
    .alias('cls')
    .action((args, callback) => {
        updateCurrentNodeRef("").then(() =>{
            vorpal.localStorage.removeItem('resultsHistory')
        }).then(callback);
    });


async function updateCurrentNodeRef(nodeRef: string) {
    vorpal.localStorage.setItem('currentNodeRef', nodeRef);
    vorpal.log(vorpal.localStorage.getItem('currentNodeRef'));
    return await getDelimiter()
        .then((del) => {
                vorpal.delimiter(del)
            }
        );
    ;
}

vorpal.command('undo delete', "Undoes the last delete.")
    .action((args, callback) => {
        let lastDeleted = vorpal.localStorage.getItem('lastDeleted');
        if (lastDeleted) {
            vorpal.log(info(`attempting to restore last deleted node: ${lastDeleted}`)) ;
            let nodesList:[string] = JSON.parse(lastDeleted);
            let restoredNodes = [];

            nodesList.forEach(node => {
                alfrescoJsApi.nodes.restoreNode(node).then(
                    () => {
                        restoredNodes.push(node);
                    }
                ).catch()
            });

            if(restoredNodes.length != nodesList.length){
                vorpal.log(`Unable to restore ${nodesList.length - restoredNodes.length} nodes.`);
                vorpal.log(`Following nodes were not restored.`);
                nodesList.filter(node => {
                    return restoredNodes.indexOf(node) == -1;
                }).forEach(node => {
                    vorpal.log(`${node}`);
                })
            }

        } else {
            vorpal.log(warning('There was no last deleted nodes available.'));
            callback();
        }
    });

function matchesPattern(entry: NodeEntry, pattern: string) {
    return mm.isMatch(entry.entry.id, pattern) || mm.isMatch(entry.entry.name, pattern);
}

function getErrorBriefSummary(e) {
    return JSON.parse(e.message).error.briefSummary;
}

vorpal.command('delete <nodeRef> [nodeRefPattern] [force]', 'Deletes a nodeRef matching a pattern')
    .alias('rm')
    .option('-f, --force', "Force deletion (no prompt)")
    .option('-p, --permanent', "Delete file permanently (Skip trashing)")
    .autocomplete({data: nodeNameAutoCompletion})
    .action(function (args, callback) {
        const self = this;

        let deletedNodes = [];

        let deleteNode = (nodeRef, permanent) => {
            vorpal.ui.redraw(`Deleting node: ${nodeRef}`);
            // let permanent = args.options.permanent;
            let deleteOp = alfrescoJsApi.core.nodesApi.deleteNode(nodeRef);
            return deleteOp.then(
                () => {
                    if (permanent) {
                        //purge the deleted node
                        vorpal.ui.redraw(info('Purging deleted node..'));
                        return alfrescoJsApi.core.nodesApi.purgeDeletedNode(nodeRef);
                    }
                    // vorpal.ui.redraw(info('setting last deleted value...' + nodeRef))
                    deletedNodes.push(nodeRef);
                    vorpal.ui.redraw(`Node ${nodeRef} successfully deleted.`);
                }
            ).then(() =>{
                vorpal.ui.redraw.done();
            }).catch(e => {
                vorpal.ui.redraw.done();
                vorpal.log(`There was an error deleting node : ${nodeRef}, reason: ${getErrorBriefSummary(e)}`)
            })
        };


        getNodeRefContext(args.nodeRef, true)
            .then(results => {
                    if (args.options.force) {
                        vorpal.log(warning('You are forcing deletion. The file(s) will be deleted without confirmation.'));
                        return results;
                    } else {
                        let promise = self.prompt({
                            type: 'confirm',
                            name: 'continue',
                            default: false,
                            message: `You are about to delete ${results.length} node(s). Continue?`,
                        });

                        return promise.then(result => {
                            if (!result.continue) {
                                throw Error("Operation cancelled.");
                            } else {
                                self.log(`Deleting ${results.length} node(s)..`);
                                return results;
                            }
                        });
                    }
                })
            .catch(e => {vorpal.log(e.message); return [];})
            .then((results:[string] )=> {
                if(results) {
                    results.forEach(result => {
                        deleteNode(result, args.options.permanent).catch(e => {
                            throw e
                        });
                    })
                }
            })
            .catch(callback)
            .then(() => {
                //persist deleted nodes;
                vorpal.localStorage.setItem('lastDeleted', JSON.stringify( deletedNodes));
            })
            .then(callback);
    });

vorpal.command('list children [nodeRefPattern]', "List all children of given node(s).")
    .alias('ls')
    .option('-p, --pattern', "Pattern for filtering.")
    .autocomplete({data: nodeNameAutoCompletion})
    .action(function (args, callback) {
        let self = this;
            getNodeRefContext(args.nodeRefPattern).then(list => {
               list.forEach(nodeRef => {
                   self.log(`listing children for nodeRef : ${nodeRef}`);
                   alfrescoJsApi.nodes.getNodeChildren(nodeRef).then(function (data) {
                       let count = data.list.pagination.count;

                       if (count > 0) {
                           self.log('The total number of children in this folder are ' + count);
                           if (args.options.pattern) {
                               printNodeList(data.list.entries.filter(entry => {
                                   return matchesPattern(entry, args.pattern);
                               }))
                           } else {
                               printNodeList(data.list.entries);
                           }
                       } else {
                           self.log("No children found.")
                       }
                   }, function (error) {
                       self.log('This node does not exist');
                   });
               })
            }).catch(callback).then(callback)
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

async function getNodeRefContext(nodeRefPattern: string, explicit = false): Promise<Array<string>> {
    let results:Array<string> = [];
    let storedNodeRef = getCurrentNodeRef();

    //check for connectivity.
    if (!alfrescoJsApi.isLoggedIn()) {
        throw new Error("Unable to connect to the repository, please login again.");
    }

    if (nodeRefPattern === "..") {
        let parent = await getParent(storedNodeRef);
        return [parent];
    }

    if (nodeRefPattern === ".") {
        results.push(storedNodeRef);
        return results;
    }

    if (nodeRefPattern) {
        //look under children first, if not look up as a node.
        await alfrescoJsApi.nodes.getNodeChildren(storedNodeRef).then(data => {
            let nodeIds = data.list.entries.filter(node => {
                return matchesPattern(node, nodeRefPattern);
            }).map(entry => {
                return entry.entry.id
            });

            if (nodeIds.length > 0) {
                return nodeIds;
            } else {
                throw new Error("Unable to find nodes matching the given pattern.");
            }
        }).then((x: Array<string    >) => {
            x.forEach(val => results.push(val));
        });
        return results;
    }

    if (!explicit) {
        results.push(storedNodeRef);
        return results;
    } else {
        throw new Error("Unable to find a matching nodeRefPattern.")
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



