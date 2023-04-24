import {isGameId, Registry} from "../types";
import DumpTable from './DumpTable';

/**
 * Groups the dump tables for all available games defined in the registry.json file.
 */
export default class DumpTablesContainer extends HTMLElement {
    constructor() {
        super();

        this.fetchInfo();
    }

    fetchInfo(): void {
        fetch("dumps/registry.json")
            .then(response => response.json())
            .then(data => this.render(data));
    }

    render(registry: Registry): void {
        Object.keys(registry).forEach(game => {
            if (!isGameId(game)) {
                throw new Error(`Invalid game id: ${game}`)
            }
            const table = new DumpTable(game);
            for (const build of registry[game]!) {
                table.addRow(build);
            }
    
            this.appendChild(table);
        });
    }
}
customElements.define('dump-tables-container', DumpTablesContainer);
