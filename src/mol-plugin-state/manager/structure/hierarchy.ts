/**
 * Copyright (c) 2020 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import { PluginContext } from '../../../mol-plugin/context';
import { StructureHierarchy, buildStructureHierarchy, ModelRef, StructureComponentRef, StructureRef, HierarchyRef, TrajectoryRef } from './hierarchy-state';
import { PluginComponent } from '../../component';
import { SetUtils } from '../../../mol-util/set';
import { StateTransform } from '../../../mol-state';

interface StructureHierarchyManagerState {
    hierarchy: StructureHierarchy,
    selection: {
        trajectories: ReadonlyArray<TrajectoryRef>,
        models: ReadonlyArray<ModelRef>,
        structures: ReadonlyArray<StructureRef>
    }
}

export class StructureHierarchyManager extends PluginComponent<StructureHierarchyManagerState> {
    readonly behaviors = {
        selection: this.ev.behavior({
            hierarchy: this.state.hierarchy,
            trajectories: this.state.selection.trajectories,
            models: this.state.selection.models,
            structures: this.state.selection.structures
        })
    }

    private get dataState() {
        return this.plugin.state.data;
    }

    private _currentComponentGroups: ReturnType<typeof StructureHierarchyManager['getComponentGroups']> | undefined = void 0;

    get currentComponentGroups() {
        if (this._currentComponentGroups) return this._currentComponentGroups;
        this._currentComponentGroups = StructureHierarchyManager.getComponentGroups(this.state.selection.structures);
        return this._currentComponentGroups;
    }

    private _currentSelectionSet: Set<string> | undefined = void 0;
    get seletionSet() {
        if (this._currentSelectionSet) return this._currentSelectionSet;
        this._currentSelectionSet = new Set();
        for (const r of this.state.selection.trajectories) this._currentSelectionSet.add(r.cell.transform.ref);
        for (const r of this.state.selection.models) this._currentSelectionSet.add(r.cell.transform.ref);
        for (const r of this.state.selection.structures) this._currentSelectionSet.add(r.cell.transform.ref);
        return this._currentSelectionSet;
    }

    get current() {
        return this.state.hierarchy;
    }

    get selection() {
        return this.state.selection;
    }

    private nextSelection: Set<StateTransform.Ref> = new Set();
    private syncCurrent<T extends HierarchyRef>(hierarchy: StructureHierarchy, current: ReadonlyArray<T>, all: ReadonlyArray<T>): T[] {
        if (this.nextSelection.size > 0) {
            const newCurrent: T[] = [];
            for (const r of all) {
                if (this.nextSelection.has(r.cell.transform.ref)) {
                    newCurrent.push(r);
                }
            }
            if (newCurrent.length === 0) return all.length > 0 ? [all[0]] : [];
            return newCurrent;
        }

        if (current.length === 0) return all.length > 0 ? [all[0]] : [];

        const newCurrent: T[] = [];
        for (const c of current) {
            const ref = hierarchy.refs.get(c.cell.transform.ref) as T;
            if (ref) newCurrent.push(ref);
        }

        if (newCurrent.length === 0) return all.length > 0 ? [all[0]] : [];
        return newCurrent;
    }

    private sync() {
        const update = buildStructureHierarchy(this.plugin.state.data, this.state.hierarchy);
        if (update.added.length === 0 && update.updated.length === 0 && update.removed.length === 0) {
            return;
        }

        this._currentComponentGroups = void 0;
        this._currentSelectionSet = void 0;

        const { hierarchy } = update;
        const trajectories = this.syncCurrent(hierarchy, this.state.selection.trajectories, hierarchy.trajectories);
        const models = this.syncCurrent(hierarchy, this.state.selection.models, hierarchy.models);
        const structures = this.syncCurrent(hierarchy, this.state.selection.structures, hierarchy.structures);

        this.nextSelection.clear();

        this.updateState({ hierarchy, selection: { trajectories, models, structures } });
        this.behaviors.selection.next({ hierarchy, trajectories, models, structures });
    }

    updateCurrent(refs: HierarchyRef[], action: 'add' | 'remove') {
        const hierarchy = this.state.hierarchy;
        const set = action === 'add'
            ? SetUtils.union(this.seletionSet, new Set(refs.map(r => r.cell.transform.ref)))
            : SetUtils.difference(this.seletionSet, new Set(refs.map(r => r.cell.transform.ref)));

        const trajectories = [];
        const models = [];
        const structures = [];

        for (const t of hierarchy.trajectories) {
            if (set.has(t.cell.transform.ref)) trajectories.push(t);
            for (const m of t.models) {
                if (set.has(m.cell.transform.ref)) models.push(m);
                for (const s of m.structures) {
                    if (set.has(s.cell.transform.ref)) structures.push(s);
                }
            }
        }

        this._currentComponentGroups = void 0;
        this._currentSelectionSet = void 0;

        // if (trajectories.length === 0 && hierarchy.trajectories.length > 0) trajectories.push(hierarchy.trajectories[0]);
        // if (models.length === 0 && hierarchy.models.length > 0) models.push(hierarchy.models[0]);
        // if (structures.length === 0 && hierarchy.structures.length > 0) structures.push(hierarchy.structures[0]);

        this.updateState({ selection: { trajectories, models, structures } });
        this.behaviors.selection.next({ hierarchy, trajectories, models, structures });
    }

    remove(refs: HierarchyRef[], canUndo?: boolean) {
        if (refs.length === 0) return;
        const deletes = this.plugin.state.data.build();
        for (const r of refs) deletes.delete(r.cell.transform.ref);
        return this.plugin.updateDataState(deletes, { canUndo: canUndo ? 'Remove' : false });
    }

    createModels(trajectories: ReadonlyArray<TrajectoryRef>, kind: 'single' | 'all' = 'single') {
        return this.plugin.dataTransaction(async () => {
            this.nextSelection.clear();

            for (const trajectory of trajectories) {
                this.nextSelection.add(trajectory.cell.transform.ref);
                if (trajectory.models.length > 0) {
                    await this.clearTrajectory(trajectory);
                }

                if (trajectory.models.length === 0) return;

                const tr = trajectory.cell.obj?.data!;
                if (kind === 'all' && tr.length > 1) {
                    for (let i = 0; i < tr.length; i++) {
                        const model = await this.plugin.builders.structure.createModel(trajectory.cell, { modelIndex: i }, { isCollapsed: true });
                        const structure = await this.plugin.builders.structure.createStructure(model, { name: 'deposited', params: {} });
                        this.nextSelection.add(model.ref);
                        this.nextSelection.add(structure.ref);
                        await this.plugin.builders.structure.representation.applyPreset(structure, 'auto', { globalThemeName: 'model-index' });
                    }
                } else {
                    const model = await this.plugin.builders.structure.createModel(trajectory.cell, { modelIndex: 0 }, { isCollapsed: true });
                    const structure = await this.plugin.builders.structure.createStructure(model);
                    this.nextSelection.add(model.ref);
                    this.nextSelection.add(structure.ref);
                    await this.plugin.builders.structure.representation.applyPreset(structure, 'auto');
                }
            }
        });
    }

    private clearTrajectory(trajectory: TrajectoryRef) {
        const builder = this.dataState.build();
        for (const m of trajectory.models) {
            builder.delete(m.cell);
        }
        return this.plugin.updateDataState(builder);
    }

    constructor(private plugin: PluginContext) {
        super({
            hierarchy: StructureHierarchy(),
            selection: { trajectories: [], models: [], structures: [] }
        });

        plugin.state.data.events.changed.subscribe(e => {
            if (e.inTransaction || plugin.behaviors.state.isAnimating.value) return;
            this.sync();
        });

        plugin.behaviors.state.isAnimating.subscribe(isAnimating => {
            if (!isAnimating && !plugin.behaviors.state.isUpdating.value) this.sync();
        });
    }
}

export namespace StructureHierarchyManager {
    export function getComponentGroups(structures: ReadonlyArray<StructureRef>): StructureComponentRef[][] {
        if (!structures.length) return [];
        if (structures.length === 1) return structures[0].components.map(c => [c]);

        const groups: StructureComponentRef[][] = [];
        const map = new Map<string, StructureComponentRef[]>();

        for (const s of structures) {
            for (const c of s.components) {
                const key = c.key;
                if (!key) continue;

                let component = map.get(key);
                if (!component) {
                    component = [];
                    map.set(key, component);
                    groups.push(component);
                }
                component.push(c);
            }
        }

        return groups;
    }
}