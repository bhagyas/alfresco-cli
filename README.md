# Alfresco CLI - Command line interface for Alfresco

> Interact with the Alfresco repository with an interactive command line.

## Target Audience

-   Alfresco Developers and Architects

## Local Development Testing

### Using Docker Compose

A Docker Compose file is provided to run a local Alfresco Community instance for testing:

```bash
# Start Alfresco (will be available at http://localhost:8082)
docker compose up -d

# Wait for Alfresco to be ready (can take a few minutes)
# Default credentials: admin / admin
```

Default admin credentials:
- Username: `admin`
- Password: `admin`

The Alfresco API will be available at: `http://localhost:8082/alfresco/api`

### Environment Variables

Set these environment variables for testing:

```bash
export ALFRESCO_HOST=http://localhost:8082/alfresco
export ALFRESCO_USERNAME=admin
export ALFRESCO_PASSWORD=admin
```

## Installation

### From NPM

-   Run `npm install -g alfresco-cli`

Available at <https://www.npmjs.com/package/alfresco-cli>

### From GitHub

-   Clone the repository

-   Install using `npm install -g && npm link`

## Features

-   Performs Alfresco operations from the terminal.

-   Autocompletes node names for valid operations.

-   Performs glob pattern matching for filename related operations.

-   Maintains a session with a valid token, automatically persists within terminal sessions.

-   Maintains a local command history

## Usage

-   Call `alfresco-cli` from your terminal.

### Logging in

Type `login --help` to read the help on logging in to the system and fetch an authentication token for the CLI.

### Changing into a node

Use `cd <nodeId>`, where nodeId is the node ID of the nodeRef you want to change to.

### Listing contents (chldren) within a node

Use `ls` or `ls <nodeId>` to list contents within a node.

### Uploading files

Use `upload <filePath> [destinationNodeId]` to upload new files to Alfresco.

### Search for contents

Use `search <query> [language]` to search for contents.

### Commands and Operations

-   Login

-   Logout

-   List files

-   List sites

-   Upload files

-   Download files \[TBD\]

-   View Metadata

### Aliases Reference

You can use the following aliases within commands.

-   `.` - current folder/content

-   `..` - parent folder/content

## License

MIT License

## Author

-   Bhagya Nirmaan Silva ([bhagyas](http://github.com/bhagyas), [about.me/bhagyas](http://about.me/bhagyas))

## Development Sponsors

-   [Loftux AB](http://loftux.com)

## Privacy Policy

There are no analytics gathered upon the use of the tool. However, the author reserves the right to add analytics on a later release to improve features provided by the tool.

## Contributors

-   Bindu Wavell ([binduwavell](https://github.com/binduwavell))

## Version History

-   **Development** - Current

    -   **Security:** Removed hardcoded credentials, now uses environment variables (`ALFRESCO_HOST`, `ALFRESCO_USERNAME`, `ALFRESCO_PASSWORD`)
    -   **Bug Fix:** Fixed `cacheResults` Array.push() bug (was returning length instead of array)
    -   **Bug Fix:** Added try-catch around all JSON.parse calls
    -   **Bug Fix:** Fixed broken error handling anti-patterns
    -   **Code Quality:** Removed all @ts-ignore directives
    -   **Config:** Enabled webpack production mode via `NODE_ENV`
    -   **Config:** Enabled strict TypeScript mode
    -   **Dependencies:** Updated @alfresco/js-api to ^7.0.0, resolved 76 security vulnerabilities
    -   **Testing:** Added Docker Compose for local Alfresco testing

-   1.4 - 20181106

    -   **Major** Added glob expansion support for `mkdir`

    -   Improved glob matching

    -   Improved error handling

-   1.3.5 - 20181031

    -   Improved delete command (`delete`)

-   1.3.4 - 20181029

    -   Added `cls` for clearing screen (@binduwavell)

    -   Added `-p --pretty` for pretty printing debug output (@binduwavell)

-   1.3 - 20181028

    -   **Major:** Improved `login` command.

    -   Added auto completion for site names when using `change site` command.

-   1.2.3 - 20181026

    -   Added search results auto completion in the results history.

    -   Added `alias set|clear` commands for adding aliases for search queries.

    -   Added glob pattern matching for `list` and `delete` commands.

-   1.2.2 - 20181026

    -   Added better `delete` function with confirmation prompt.

    -   Added `undo delete` to restore last deleted node.

-   1.2.1 - 20181025

    -   Added `list versions` command.

-   1.2 - 20181025

    -   **Major:** Adding folder name auto completion

    -   Added `delete` command with support for deleting child nodes.

-   1.1 - 20181024

    -   Converted the code to Typescript

    -   Added support for node name as an alias for nodeId when referred from a valid context.

    -   Added `create user`, `create site`, `cd-site`, `search` commands.

    -   Added support for `.` and `..` aliases.

-   1.0 - 20181023

    -   Initial release
