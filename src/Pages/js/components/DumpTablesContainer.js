import DumpTable from './DumpTable.js';

export default class DumpTablesContainer extends HTMLElement {
    constructor() {
        super();

        this.attachShadow({ mode: "open" });

        this.fetchInfo();
    }

    fetchInfo() {
        fetch("dumps/info.json")
            .then(response => response.json())
            .then(data => this.render(data));
    }

    render(info) {
        Object.keys(info).forEach(game => {
            const table = new DumpTable(game);
            for (const dumpInfo of info[game]) {
                table.addRow(dumpInfo.build, dumpInfo.aliases);
            }
    
            this.shadowRoot.appendChild(table);
        });
    }
}
customElements.define('dump-tables-container', DumpTablesContainer);
