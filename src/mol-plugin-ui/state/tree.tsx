/**
 * Copyright (c) 2018 - 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 */

import * as React from 'react';
import { PluginStateObject } from '../../mol-plugin-state/objects';
import { State, StateTree as _StateTree, StateObject, StateTransform, StateObjectCell, StateAction } from '../../mol-state'
import { PluginCommands } from '../../mol-plugin/commands';
import { PluginUIComponent, _Props, _State } from '../base';
import { Icon } from '../controls/icons';
import { ActionMenu } from '../controls/action-menu';
import { ApplyActionControl } from './apply-action';
import { ControlGroup } from '../controls/common';
import { UpdateTransformControl } from './update-transform';

export class StateTree extends PluginUIComponent<{ state: State }, { showActions: boolean }> {
    state = { showActions: true };

    componentDidMount() {
        this.subscribe(this.plugin.events.state.cell.created, e => {
            if (e.cell.transform.parent === StateTransform.RootRef) this.forceUpdate();
        });

        this.subscribe(this.plugin.events.state.cell.removed, e => {
            if (e.parent === StateTransform.RootRef) this.forceUpdate();
        });
    }

    static getDerivedStateFromProps(props: { state: State }, state: { showActions: boolean }) {
        const n = props.state.tree.root.ref;
        const children = props.state.tree.children.get(n);
        const showActions = children.size === 0;
        if (state.showActions === showActions) return null;
        return { showActions };
    }

    render() {
        const ref = this.props.state.tree.root.ref;
        if (this.state.showActions) {
            return <div style={{ margin: '10px', cursor: 'default' }}>
                <p>Nothing to see here.</p>
                <p>Structures can be loaded from the <Icon name='home' /> tab.</p>
            </div>
        }
        return <StateTreeNode cell={this.props.state.cells.get(ref)!} depth={0} />;
    }
}

class StateTreeNode extends PluginUIComponent<{ cell: StateObjectCell, depth: number }, { isCollapsed: boolean }> {
    is(e: State.ObjectEvent) {
        return e.ref === this.ref && e.state === this.props.cell.parent;
    }

    get ref() {
        return this.props.cell.transform.ref;
    }

    componentDidMount() {
        this.subscribe(this.plugin.events.state.cell.stateUpdated, e => {
            if (this.props.cell === e.cell && this.is(e) && e.state.cells.has(this.ref)) {
                this.forceUpdate();
                // if (!!this.props.cell.state.isCollapsed !== this.state.isCollapsed) {
                //     this.setState({ isCollapsed: !!e.cell.state.isCollapsed });
                // }
            }
        });

        this.subscribe(this.plugin.events.state.cell.created, e => {
            if (this.props.cell.parent === e.state && this.ref === e.cell.transform.parent) {
                this.forceUpdate();
            }
        });

        this.subscribe(this.plugin.events.state.cell.removed, e => {
            if (this.props.cell.parent === e.state && this.ref === e.parent) {
                this.forceUpdate();
            }
        });
    }

    state = {
        isCollapsed: !!this.props.cell.state.isCollapsed
    }

    static getDerivedStateFromProps(props: _Props<StateTreeNode>, state: _State<StateTreeNode>): _State<StateTreeNode> | null {
        if (!!props.cell.state.isCollapsed === state.isCollapsed) return null;
        return { isCollapsed: !!props.cell.state.isCollapsed };
    }

    hasDecorator(children: _StateTree.ChildSet) {
        if (children.size !== 1) return false;
        const ref = children.values().next().value;
        return !!this.props.cell.parent.tree.transforms.get(ref).isDecorator;
    }

    render() {
        const cell = this.props.cell;
        if (!cell || cell.obj === StateObject.Null || !cell.parent.tree.transforms.has(cell.transform.ref)) {
            return null;
        }

        const cellState = cell.state;
        const children = cell.parent.tree.children.get(this.ref);
        const showLabel = (cell.transform.ref !== StateTransform.RootRef) && (cell.status !== 'ok' || (!cell.state.isGhost && !this.hasDecorator(children)));

        if (!showLabel) {
            if (children.size === 0) return null;
            return <div style={{ display: cellState.isCollapsed ? 'none' : 'block' }}>
                {children.map(c => <StateTreeNode cell={cell.parent.cells.get(c!)!} key={c} depth={this.props.depth} />)}
            </div>;
        }

        const newDepth = this.props.depth + 1;
        return <>
            <StateTreeNodeLabel cell={cell} depth={this.props.depth} />
            {children.size === 0
                ? void 0
                : <div style={{ display: cellState.isCollapsed ? 'none' : 'block' }}>
                    {children.map(c => <StateTreeNode cell={cell.parent.cells.get(c!)!} key={c} depth={newDepth} />)}
                </div>
            }
        </>;
    }
}

interface StateTreeNodeLabelState {
    isCurrent: boolean,
    isCollapsed: boolean,
    action?: 'options' | 'apply',
    currentAction?: StateAction
}

class StateTreeNodeLabel extends PluginUIComponent<{ cell: StateObjectCell, depth: number }, StateTreeNodeLabelState> {

    is(e: State.ObjectEvent) {
        return e.ref === this.ref && e.state === this.props.cell.parent;
    }

    get ref() {
        return this.props.cell.transform.ref;
    }

    componentDidMount() {
        this.subscribe(this.plugin.events.state.cell.stateUpdated, e => {
            if (this.is(e)) this.forceUpdate();
        });

        this.subscribe(this.plugin.state.behavior.currentObject, e => {
            if (!this.is(e)) {
                if (this.state.isCurrent && e.state.transforms.has(this.ref)) {
                    this._setCurrent(this.props.cell.parent.current === this.ref, this.state.isCollapsed);
                }
                return;
            }

            if (e.state.transforms.has(this.ref)) {
                this._setCurrent(this.props.cell.parent.current === this.ref, !!this.props.cell.state.isCollapsed)
                // this.setState({
                //     isCurrent: this.props.cell.parent.current === this.ref,
                //     isCollapsed: !!this.props.cell.state.isCollapsed
                // });
            }
        });
    }

    private _setCurrent(isCurrent: boolean, isCollapsed: boolean) {
        if (isCurrent) {
            this.setState({ isCurrent, action: 'options', currentAction: void 0, isCollapsed });
        } else {
            this.setState({ isCurrent, action: void 0, currentAction: void 0, isCollapsed });
        }
    }

    state: StateTreeNodeLabelState = {
        isCurrent: this.props.cell.parent.current === this.ref,
        isCollapsed: !!this.props.cell.state.isCollapsed,
        action: void 0,
        currentAction: void 0 as StateAction | undefined
    }

    static getDerivedStateFromProps(props: _Props<StateTreeNodeLabel>, state: _State<StateTreeNodeLabel>): _State<StateTreeNodeLabel> | null {
        const isCurrent = props.cell.parent.current === props.cell.transform.ref;
        const isCollapsed = !!props.cell.state.isCollapsed;

        if (state.isCollapsed === isCollapsed && state.isCurrent === isCurrent) return null;
        return { isCurrent, isCollapsed, action: void 0, currentAction: void 0 };
    }

    setCurrent = (e?: React.MouseEvent<HTMLElement>) => {
        e?.preventDefault();
        e?.currentTarget.blur();
        PluginCommands.State.SetCurrentObject(this.plugin, { state: this.props.cell.parent, ref: this.ref });
    }

    setCurrentRoot = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        e.currentTarget.blur();
        PluginCommands.State.SetCurrentObject(this.plugin, { state: this.props.cell.parent, ref: StateTransform.RootRef });
    }

    remove = (e?: React.MouseEvent<HTMLElement>) => {
        e?.preventDefault();
        PluginCommands.State.RemoveObject(this.plugin, { state: this.props.cell.parent, ref: this.ref, removeParentGhosts: true });
    }

    toggleVisible = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        PluginCommands.State.ToggleVisibility(this.plugin, { state: this.props.cell.parent, ref: this.ref });
        e.currentTarget.blur();
    }

    toggleExpanded = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        PluginCommands.State.ToggleExpanded(this.plugin, { state: this.props.cell.parent, ref: this.ref });
        e.currentTarget.blur();
    }

    highlight = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        PluginCommands.Interactivity.Object.Highlight(this.plugin, { state: this.props.cell.parent, ref: this.ref });
        e.currentTarget.blur();
    }

    clearHighlight = (e: React.MouseEvent<HTMLElement>) => {
        e.preventDefault();
        PluginCommands.Interactivity.ClearHighlights(this.plugin);
        e.currentTarget.blur();
    }

    // toggleActions = () => {
    //     if (this.state.action) this.setState({ action: void 0, currentAction: void 0 });
    //     else this.setState({ action: 'options', currentAction: void 0 });
    // }

    hideAction = () => this.setState({ action: void 0, currentAction: void 0 });

    get actions() {
        const cell = this.props.cell;
        const actions = [...cell.parent.actions.fromCell(cell, this.plugin)];
        if (actions.length === 0) return;

        actions.sort((a, b) => a.definition.display.name < b.definition.display.name ? -1 : a.definition.display.name === b.definition.display.name ? 0 : 1);

        return [
            ActionMenu.Header('Apply Action'),
            ...actions.map(a => ActionMenu.Item(a.definition.display.name, () => this.setState({ action: 'apply', currentAction: a })))
        ];
    }

    selectAction: ActionMenu.OnSelect = item => {
        if (!item) return;
        (item?.value as any)();
    }

    render() {
        const cell = this.props.cell;
        const n = cell.transform;
        if (!cell) return null;

        const isCurrent = this.is(cell.parent.behaviors.currentObject.value);

        let label: any;
        if (cell.status === 'pending' || cell.status === 'processing') {
            const name = n.transformer.definition.display.name;
            label = <><b>[{cell.status}]</b> <span title={name}>{name}</span></>;
        } else if (cell.status !== 'ok' || !cell.obj) {
            const name = n.transformer.definition.display.name;
            const title = `${cell.errorText}`;

            // {this.state.isCurrent ? this.setCurrentRoot : this.setCurrent
            label = <><button className='msp-btn-link msp-btn-tree-label' title={title} onClick={this.state.isCurrent ? this.setCurrentRoot : this.setCurrent}><b>[{cell.status}]</b> {name}: <i><span>{cell.errorText}</span></i> </button></>;
        } else {
            const obj = cell.obj as PluginStateObject.Any;
            const title = `${obj.label} ${obj.description ? obj.description : ''}`;
            label = <><button className='msp-btn-link msp-btn-tree-label' title={title} onClick={this.state.isCurrent ? this.setCurrentRoot : this.setCurrent}><span>{obj.label}</span> {obj.description ? <small>{obj.description}</small> : void 0}</button></>;
        }

        const children = cell.parent.tree.children.get(this.ref);
        const cellState = cell.state;

        const visibility = <button onClick={this.toggleVisible} className={`msp-btn msp-btn-link msp-tree-visibility${cellState.isHidden ? ' msp-tree-visibility-hidden' : ''}`}>
            <Icon name='visual-visibility' />
        </button>;

        const style: React.HTMLAttributes<HTMLDivElement>['style'] = {
            marginLeft: /* this.state.isCurrent ? void 0 :*/ `${this.props.depth * 8}px`,
            // paddingLeft: !this.state.isCurrent ? void 0 : `${this.props.depth * 10}px`,
            borderLeft: /* isCurrent || */ this.props.depth === 0 ? 'none' : void 0
        }

        const row = <div className={`msp-tree-row${isCurrent ? ' msp-tree-row-current' : ''}`} onMouseEnter={this.highlight} onMouseLeave={this.clearHighlight} style={style}>
            {label}
            {children.size > 0 &&  <button onClick={this.toggleExpanded} className='msp-btn msp-btn-link msp-tree-toggle-exp-button'>
                <Icon name={cellState.isCollapsed ? 'expand' : 'collapse'} />
            </button>}
            {!cell.state.isLocked && <button onClick={this.remove} className='msp-btn msp-btn-link msp-tree-remove-button'>
                <Icon name='remove' />
            </button>}{visibility}
        </div>;

        if (!isCurrent) return row;

        if (this.state.action === 'apply' && this.state.currentAction) {
            return <div style={{ marginBottom: '1px' }}>
                {row}
                <ControlGroup header={`Apply ${this.state.currentAction.definition.display.name}`} initialExpanded={true} hideExpander={true} hideOffset={false} onHeaderClick={this.hideAction} topRightIcon='off'>
                    <ApplyActionControl onApply={this.hideAction} state={this.props.cell.parent} action={this.state.currentAction} nodeRef={this.props.cell.transform.ref} hideHeader noMargin />
                </ControlGroup>
            </div>
        }

        if (this.state.action === 'options') {
            let actions = this.actions;
            return <div style={{ marginBottom: '1px' }}>
                {row}
                <UpdateTransformControl state={cell.parent} transform={cell.transform} noMargin wrapInExpander />
                {actions && <ActionMenu items={actions} onSelect={this.selectAction} />}
            </div>
        }

        // if (this.state.isCurrent) {
        //     return <>
        //         {row}
        //         <StateTreeNodeTransform {...this.props} toggleCollapsed={this.toggleUpdaterObs} />
        //     </>
        // }

        return row;
    }
}

// class StateTreeNodeTransform extends PluginUIComponent<{ nodeRef: string, state: State, depth: number, toggleCollapsed?: Observable<any> }> {
//     componentDidMount() {
//         // this.subscribe(this.plugin.events.state.object.updated, ({ ref, state }) => {
//         //     if (this.props.nodeRef !== ref || this.props.state !== state) return;
//         //     this.forceUpdate();
//         // });
//     }

//     render() {
//         const ref = this.props.nodeRef;
//         const cell = this.props.state.cells.get(ref)!;
//         const parent: StateObjectCell | undefined = (cell.sourceRef && this.props.state.cells.get(cell.sourceRef)!) || void 0;

//         if (!parent || parent.status !== 'ok') return null;

//         const transform = cell.transform;
//         return <UpdateTransformContol state={this.props.state} transform={transform} initiallyCollapsed={true} toggleCollapsed={this.props.toggleCollapsed} />;
//     }
// }