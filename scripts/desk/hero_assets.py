"""Original, reproducible PBR hero models. Coordinates use the web scene's Y-up convention.
No downloaded textures: walnut and speaker cloth are authored here and packed in GLB.
"""
from math import sin, cos, pi
import bpy
import numpy as np
from mathutils import Vector

MOBILE = False
GROUP = None

def group(name):
    global GROUP
    GROUP = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(GROUP)
    return GROUP

def loc(p):
    return (p[0], -p[2], p[1])

def finish(obj, name, mat, bevel=0):
    obj.name = name
    obj.parent = GROUP
    obj.data.materials.append(mat)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Manufactured edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 1 if MOBILE else (2 if GROUP.name == 'Scenery' else 3)
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for face in obj.data.polygons:
        face.use_smooth = True
    mod = obj.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    mod.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj

def box(name, p, d, mat, bevel=.03):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc(p))
    obj = bpy.context.object
    obj.dimensions = (d[0], d[2], d[1])
    return finish(obj, name, mat, min(bevel, min(d)*.35))

def cylinder(name, p, radius, depth, mat, front=False, top_radius=None):
    bpy.ops.mesh.primitive_cone_add(vertices=24 if MOBILE else 48, radius1=radius,
        radius2=radius if top_radius is None else top_radius, depth=depth, location=loc(p))
    obj = bpy.context.object
    if front:
        obj.rotation_euler[0] = pi/2
    return finish(obj, name, mat, min(.015, depth*.15))

def line(name, points, radius, mat):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 8
    curve.bevel_depth = radius
    curve.bevel_resolution = 1 if MOBILE else 3
    spline = curve.splines.new('BEZIER')
    spline.bezier_points.add(len(points)-1)
    for vertex,p in zip(spline.bezier_points, points):
        vertex.co = loc(p)
        vertex.handle_left_type = vertex.handle_right_type = 'AUTO'
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    obj.parent = GROUP
    curve.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.convert(target='MESH')
    return obj

def label(text, p, size, mat, flat=False):
    if MOBILE:
        return
    bpy.ops.object.text_add(location=loc(p))
    obj = bpy.context.object
    obj.name = 'Engraving'
    obj.data.body = text
    obj.data.size = size
    obj.data.align_x = 'CENTER'
    obj.data.resolution_u = 3
    if not flat:
        obj.rotation_euler[0] = pi/2
    obj.data.materials.append(mat)
    obj.parent = GROUP
    bpy.ops.object.convert(target='MESH')

def material(name, color, roughness=.5, metal=0, emission=0):
    mat = bpy.data.materials.new('Desk / '+name)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*color,1)
    node.inputs['Roughness'].default_value = roughness
    node.inputs['Metallic'].default_value = metal
    if emission:
        node.inputs['Emission Color'].default_value = (*color,1)
        node.inputs['Emission Strength'].default_value = emission
    return mat

def texture_material(name, kind):
    mat = material(name, (1,1,1), .53 if kind=='wood' else .88)
    size = 512 if kind=='wood' else 256
    y,x = np.mgrid[0:size,0:size].astype(float)/size
    rng = np.random.default_rng(41)
    if kind=='wood':
        # Non-periodic, anisotropic grain. Fine pores sit over slower growth rings.
        grain = y*38 + .45*np.sin(x*7+y*3) + .18*np.sin(x*19+y*5)
        v = np.full((size,size), .78)
        for frequency in [0.41, 1.13, 2.37, 4.81]:
            v += .04*np.sin(grain*frequency*2*pi + rng.random()*6)
        v += rng.random((size,size))*.035
        rgb = v[:,:,None]*np.array([.43,.28,.165])
    else:
        weave = (.5+.5*np.sin(x*2*pi*64))*(.5+.5*np.sin(y*2*pi*64))
        rgb = (.33 + .28*weave[:,:,None])*np.array([.50,.43,.32])
    pixels = np.concatenate((rgb, np.ones((size,size,1))),axis=2).astype(np.float32)
    image = bpy.data.images.new(name, width=size,height=size)
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    tex = mat.node_tree.nodes.new('ShaderNodeTexImage')
    tex.image = image
    mat.node_tree.links.new(tex.outputs['Color'], mat.node_tree.nodes.get('Principled BSDF').inputs['Base Color'])
    return mat

def merge_groups():
    # Join by semantic prop, retain PBR material slots. Hundreds of small details
    # become a handful of draw calls rather than hundreds of separate meshes.
    for root in [o for o in bpy.context.scene.objects if o.type == 'EMPTY' and o.get('hero')]:
        meshes = [o for o in root.children_recursive if o.type=='MESH']
        if not meshes:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        bpy.context.object.name = root.name+'__finish'

def build(variant, mobile):
    global MOBILE
    MOBILE = mobile
    studio = variant=='studio'
    surface = 1.81 if studio else 1.64
    wood = texture_material('Oiled walnut', 'wood')
    cloth = texture_material('Woven speaker cloth', 'cloth')
    dark = material('Anodized graphite', (.035,.045,.055) if studio else (.022,.035,.075), .32,.65)
    rubber = material('Soft graphite', (.012,.018,.024),.88)
    brass = material('Brushed brass' if studio else 'Brushed titanium', (.5,.29,.10) if studio else (.30,.40,.53),.27,.8)
    cream = material('Ivory polymer',(.65,.62,.51),.6)
    accent = material('Amber' if studio else 'Cyan', (1,.45,.1) if studio else (.025,.64,1),.28,.15,2.5)
    pink = material('Rose light',(.9,.025,.26),.35,.1,2.3)
    paper = material('Warm linen',(.58,.43,.26),.94)
    for name in ['Desk','Computer','KeyboardKey' if studio else 'NeonKey','Radio','PhotoDisplay','Lamp','Accessories']:
        root=group(name)
        root['hero']=True
        if name=='Desk':
            box('Tabletop', (0,surface-.15,-3.3),(10.7,.30,4.7),wood if studio else dark,.10)
            box('Under edge',(0,surface-.34,-3.3),(10.35,.09,4.35),dark)
            for x in [-4.6,4.6]:
                for z in [-5.1,-1.5]:
                    box('Leg',(x,(surface-.3-3.38)/2,z),(.23,surface-.3+3.38,.23),dark)
                    cylinder('Leveling foot',(x,-3.32,z),.17,.12,rubber)
                box('Stretcher',(x,-2.85,-3.3),(.17,.15,3.65),brass)
            box('Rear rail',(0,surface-.62,-5.05),(9.2,.45,.15),dark)
            box('Desk mat',(.15,surface+.018,-2.7),(4.85,.036,2.02),rubber,.05)
            if not studio:
                box('Front light',(0,surface-.20,-.941),(9.9,.025,.02),accent,.004)
                for x in [-4.95,4.95]:
                    box('Side rail',(x,surface+.015,-3.3),(.035,.035,4.1),pink,.005)
        elif name=='Computer':
            sy=3.22 if studio else 3.08
            sz=-4.15 if studio else -4.05
            box('Display housing',(0,sy,sz-.10),(3.83,2.24,.23),dark,.075)
            box('Display gasket',(0,sy,sz+.019),(3.64,2.055,.045),rubber,.025)
            # Video plane is owned by React at z + .045, exact 16:9 aperture.
            box('Monitor base',(0,surface+.07,-4.3),(1.35,.14,.84),brass,.055)
            box('Monitor neck',(0,surface+.48,-4.38),(.23,.83,.22),dark)
            label('SOLIDAYS',(0,sy-1.073,sz+.047),.065,cream)
            cylinder('Power LED',(1.66,sy-1.065,sz+.047),.018,.015,accent,True)
            for i in range(12 if not mobile else 6):
                box('Vent',(-.85+i*(.15 if not mobile else .3),sy+.82,sz-.221),(.045,.18,.013),rubber,.003)
        elif name in ['KeyboardKey','NeonKey']:
            box('Keyboard case',(-.15,surface+.10,-2.63),(3.05,.16,1.04),brass,.07)
            box('Switch plate',(-.15,surface+.19,-2.63),(2.93,.035,.94),rubber,.02)
            for row in range(4):
                for col in range(12):
                    x=-1.47+col*.235
                    z=-2.99+row*.226
                    box('Keycap',(x,surface+.235,z),(.207,.095,.19),cream if studio else dark,.025)
                    if not studio and row==0:
                        box('Backlit legend',(x,surface+.285,z),(.055,.006,.018),accent,.002)
                    elif row<3:
                        label(('1234567890-=' if row==0 else 'QWERTYUIOP[]' if row==1 else 'ASDFGHJKL;XX')[col],(x,surface+.286,z),.065,rubber,True)
            box('Spacebar',(-.15,surface+.23,-2.045),(1.2,.09,.18),cream if studio else dark,.025)
            cylinder('Keyboard dial',(1.24,surface+.265,-2.045),.075,.095,brass)
            box('Mouse',(1.75,surface+.12,-2.6),(.42,.24,.65),cream if studio else dark,.09)
            box('Mouse split',(1.75,surface+.243,-2.76),(.008,.004,.25),rubber,.001)
            cylinder('Scroll wheel',(1.75,surface+.25,-2.70),.038,.07,rubber)
        elif name=='Radio':
            x=-3.65 if studio else -3.55
            z=-3.65 if studio else -3.45
            box('Radio cabinet',(x,surface+.64,z),(2.18,1.23,.88),wood if studio else dark,.115)
            box('Face trim',(x,surface+.64,z+.453),(2.02,1.08,.045),brass,.06)
            box('Speaker grille',(x-.35,surface+.64,z+.483),(1.18,.94,.035),cloth,.06)
            box('Tuner surround',(x+.65,surface+.83,z+.489),(.56,.35,.035),rubber,.025)
            box('Tuner glass',(x+.65,surface+.85,z+.512),(.47,.19,.015),accent,.01)
            for i in range(10):
                box('Tuning tick',(x+.44+i*.045,surface+.85,z+.524),(.008,.045 if i%2 else .075,.009),cream,.002)
            for dx in [.45,.84]:
                cylinder('Knob bezel',(x+dx,surface+.38,z+.525),.145,.05,dark,True)
                cylinder('Knurled knob',(x+dx,surface+.38,z+.58),.112,.075,brass,True)
                box('Dial pointer',(x+dx,surface+.434,z+.62),(.016,.063,.008),cream,.002)
            for dx in [-.65,-.20]:
                box('Transport key',(x+dx,surface+.28,z+.535),(.30,.17,.065),brass,.025)
            for dx in [-.8,.8]:
                cylinder('Radio foot',(x+dx,surface+.045,z),.1,.09,rubber)
            label('SOLIDAYS FM',(x-.35,surface+1.0,z+.508),.075,cream)
            if not mobile:
                line('Aerial',[(x+.85,surface+1.25,z-.2),(x+1.0,surface+2.1,z-.3)],.018,brass)
        elif name=='PhotoDisplay':
            x=3.15; y=surface+1.17; z=-4.32
            # Portrait aperture; React image is within this frame, not floating in front.
            box('Photo back',(x,y,z-.11),(1.65,2.13,.18),wood if studio else dark,.06)
            box('Mat board',(x,y,z+.005),(1.51,1.99,.035),cream,.015)
            for dx in [-.80,.80]:
                box('Frame side',(x+dx,y,z+.045),(.085,2.14,.12),wood if studio else brass,.02)
            for dy in [-1.03,1.03]:
                box('Frame rail',(x,y+dy,z+.045),(1.65,.085,.12),wood if studio else brass,.02)
            box('Photo foot',(x,surface+.06,z-.28),(1.15,.12,.65),dark,.03)
            label('FEAR AND DREAMS',(x,y-.943,z+.028),.06,dark)
        elif name=='Lamp':
            x=4.62; z=-4.6
            cylinder('Lamp base',(x,surface+.075,z),.42,.15,brass)
            cylinder('Lamp stem',(x,surface+1.05,z),.035,1.90,brass)
            if studio:
                # Open, lined conical shade: no opaque cap blocking the light.
                n=24 if mobile else 64
                verts=[]
                for y,r in [(surface+1.70,.55),(surface+2.55,.34)]:
                    verts += [loc((x+r*cos(i*2*pi/n),y,z+r*sin(i*2*pi/n))) for i in range(n)]
                mesh=bpy.data.meshes.new('Shade weave')
                mesh.from_pydata(verts,[],[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)])
                obj=bpy.data.objects.new('Open linen shade',mesh)
                bpy.context.collection.objects.link(obj)
                obj.parent=GROUP
                obj.data.materials.append(paper)
                for f in mesh.polygons:f.use_smooth=True
                cylinder('Warm diffuser',(x,surface+1.74,z),.50,.025,accent)
            else:
                box('Task light head',(x-.3,surface+2.0,z),(1.2,.12,.28),dark,.05)
                box('Task light diffuser',(x-.3,surface+1.933,z),(1.05,.02,.20),accent,.01)
        else:
            # A few intimate objects; leave both message sheets unobstructed.
            cylinder('Coaster',(-4.72,surface+.024,-2.15),.36,.048,wood if studio else brass)
            cylinder('Ceramic cup',(-4.72,surface+.30,-2.15),.25,.52,cream,top_radius=.29)
            coffee=material('Coffee',(.018,.007,.003),.2)
            cylinder('Coffee surface',(-4.72,surface+.567,-2.15),.245,.01,coffee)
            line('Cup handle',[(-4.48,surface+.44,-2.15),(-4.29,surface+.44,-2.15),(-4.29,surface+.19,-2.15),(-4.49,surface+.17,-2.15)],.045,cream)
            line('Pen',[(5.19,surface+.07,-2.9),(5.16,surface+.07,-1.99)],.028,brass)
            line('Pen nib',[(5.16,surface+.07,-1.99),(5.156,surface+.07,-1.88)],.011,dark)
            if not mobile:
                line('Monitor cable',[(0,surface+.4,-4.5),(.5,surface+.03,-5.1),(1.6,surface+.02,-5.4),(1.7,.5,-5.6)],.027,rubber)
                line('Radio cable',[(-3.7,surface+.2,-4.1),(-3.5,surface+.035,-4.8),(-1.6,surface+.04,-5.45),(-1.6,.4,-5.6)],.024,rubber)
    root=group('Scenery')
    root['hero']=True
    if studio:
        # Walnut shelf and botanical silhouette replace the visibly faceted kit props.
        for y in [-3.22,-1.48,.26]:
            box('Shelf',(6.65,y,-6.3),(2.0,.15,1.0),wood,.04)
        for x in [5.73,7.57]:
            for z in [-6.73,-5.87]:
                box('Shelf upright',(x,-1.48,z),(.095,3.65,.095),dark,.018)
        for i in range(7):
            cover=material('Book cover '+str(i),[(.12,.20,.18),(.32,.13,.08),(.34,.29,.19)][i%3],.8)
            x=5.98+i*.19
            h=.72+(i%3)*.13
            box('Book pages',(x,.35+h/2,-6.25),(.14,h,.64),cream,.012)
            box('Book spine',(x,.35+h/2,-5.92),(.16,h+.03,.035),cover,.012)
            for dy in [-.22,.22]:
                box('Book spine foil',(x,.35+h/2+dy,-5.90),(.11,.015,.005),brass,.002)
        # Keep a separate left furnishing bay, clear of the desk legs and curtain.
        box('Record cabinet',(-8.8,-1.91,-5.9),(1.7,2.75,1.3),wood,.06)
        box('Cabinet inset',(-8.8,-1.82,-5.228),(1.46,2.28,.045),rubber,.015)
        for i in range(9):
            x=-9.4+i*.145
            box('LP sleeve',(x,-1.58,-5.48),(.085,1.72,.66),cream if i%3 else wood,.007)
        box('Display shelf',(-9.0,4.0,-7.72),(1.45,.12,.62),wood,.025)
        for i in range(4):
            box('Display book',(-9.37+i*.2,2.68,-7.75),(.15,.83,.32),cream if i%2 else wood,.012)
        cylinder('Display vase',(-9.0,4.42,-7.72),.22,.72,cream,top_radius=.12)
        line('Dried branch',[(-9.0,4.7,-7.72),(-9.08,5.15,-7.7),(-8.83,5.5,-7.7)],.018,brass)
        plant_start = set(bpy.context.scene.objects)
        pot=material('Stoneware',(.22,.19,.14),.86)
        leaf=material('Leaf jade',(.038,.13,.07),.65)
        cylinder('Planter',(-6.3,-2.85,-6.3),.43,1.06,pot,top_radius=.57)
        cylinder('Potting soil',(-6.3,-2.32,-6.3),.52,.025,rubber)
        for i in range(7 if mobile else 11):
            angle=i*2.399
            end=(-6.3+.63*cos(angle),-1.8+(i%4)*.55,-6.3+.60*sin(angle))
            line('Plant stem',[(-6.3,-2.35,-6.3),(-6.3,-1.7,-6.3),end],.018,leaf)
            bpy.ops.mesh.primitive_uv_sphere_add(segments=12 if mobile else 20, ring_count=8,
                location=loc((end[0]+.16*cos(angle),end[1]+.16,end[2]+.16*sin(angle))))
            obj=bpy.context.object
            obj.scale=(.24,.065,.52)
            obj.rotation_euler=(.5*cos(angle),.5*sin(angle),angle)
            finish(obj,'Leaf',leaf)
        # Move the complete plant onto the cabinet and scale around its floor anchor.
        for obj in set(bpy.context.scene.objects) - plant_start:
            obj.location = Vector(loc((-8.8,-.535,-5.9))) + .42 * (obj.location - Vector(loc((-6.3,-3.38,-6.3))))
            obj.scale *= .42
        if not mobile:
            rug=material('Wool slate',(.043,.061,.065),1)
            box('Woven rug',(0,-3.35,-1.8),(13,.04,8),rug,.015)
    else:
        # A dedicated left control station above the existing equipment rack.
        box('Console plinth',(-6.6,.82,-6.4),(1.85,.16,1.36),brass,.04)
        box('Console screen housing',(-6.6,1.64,-6.56),(1.55,1.24,.2),dark,.06)
        box('Console glass',(-6.6,1.65,-6.448),(1.32,.99,.018),rubber,.015)
        for i in range(7):
            box('Telemetry bar',(-6.95+i*.115,1.43+(i%3)*.04,-6.429),(.055,.2+(i%3)*.08,.012),accent,.004)
        box('Telemetry header',(-6.6,1.98,-6.429),(1.1,.025,.012),pink,.004)
        for y in [2.1,4.05]:
            box('Equipment display shelf',(-9.15,y,-7.48),(1.45,.1,.78),dark,.03)
            box('Shelf light',(-9.15,y-.045,-7.07),(1.3,.025,.025),accent,.004)
        for i in range(3):
            box('Archive cartridge',(-9.54+i*.39,2.59,-7.43),(.28,.85,.4),brass,.03)
            box('Cartridge identifier',(-9.54+i*.39,2.65,-7.222),(.15,.035,.012),accent,.004)
        cylinder('Display pedestal',(-9.15,4.17,-7.43),.43,.15,dark)
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1 if mobile else 2,radius=.40,location=loc((-9.15,4.68,-7.43)))
        finish(bpy.context.object,'Faceted artifact',brass)
        for side in [-1,1]:
            x=side*6.6
            box('Equipment rack',(x,-1.34,-6.5),(1.65,4.08,1.2),dark,.09)
            for y in [-2.7,-1.9,-1.1,-.3]:
                box('Rack module',(x,y,-5.873),(1.44,.66,.08),rubber,.018)
                for row in range(4):
                    box('Rack ventilation',(x-.12,y-.20+row*.13,-5.825),(1.0,.032,.014),brass,.005)
                cylinder('Module status',(x+.56,y+.15,-5.816),.025,.015,accent,True)
            box('Wall acoustic panel',(side*7.7,3.0,-7.95),(1.1,4.1,.20),dark,.055)
            for i in range(6):
                box('Acoustic rib',(side*7.7-.43+i*.17,3,-7.80),(.045,3.9,.13),rubber,.01)
            box('Panel edge light',(side*8.23,3,-7.81),(.022,3.85,.018),accent if side<0 else pink,.004)
    merge_groups()
