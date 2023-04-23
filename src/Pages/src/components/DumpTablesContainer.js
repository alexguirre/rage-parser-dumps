import DumpTable from './DumpTable.js';

export default class DumpTablesContainer extends HTMLElement {
    constructor() {
        super();

        this.fetchInfo();
    }

    fetchInfo() {
        fetch("dumps/registry.json")
            .then(response => response.json())
            .then(data => this.render(data));
    }

    render(registry) {
        Object.keys(registry).forEach(game => {
            const table = new DumpTable(game);
            for (const dumpInfo of registry[game]) {
                table.addRow(dumpInfo.build, dumpInfo.aliases);
            }
    
            this.appendChild(table);
        });
    }
}
customElements.define('dump-tables-container', DumpTablesContainer);
