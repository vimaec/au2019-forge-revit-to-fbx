-- Inspired by the work of Michael Vladimir Nicolayeff
-- http://www.scriptspot.com/3ds-max/scripts/architecture-to-standard-material-converter
-- http://www.scriptspot.com/3ds-max/scripts/autodesk-map-to-bitmaptexture

fn convertAdskMap inMap = 
(
	if not isKindOf inMap Autodesk_Map do
	(
		return inMap
	)
	outMap = bitmaptexture()

	outMap.name = inmap.name
	outMap.coords.realWorldScale = on
	
	outMap.coords.U_Offset = inMap.Position_X
	outMap.coords.V_Offset = inMap.Position_Y
	
	--Noise has not Scale_Width
	if hasProperty inMap "Scale_Width"  do (
		outMap.coords.U_Tiling = 1/inMap.Scale_Width -- for some reason these have to be inverted
		outMap.coords.V_Tiling = 1/inMap.Scale_Height -- for some reason these have to be inverted	
	)
	if hasProperty inMap "Repeat_Vertical" do (
		outmap.coordinates.U_Tile = inMap.Repeat_Vertical
		outMap.coordinates.V_Tile = inMap.Repeat_Horizontal
		outMap.coords.W_angle = inMap.Position_Rotation
	)
	
	if hasProperty inMap "Advanced_Parameters_Map_Channel" do (
		outMap.coordinates.mapChannel = inMap.Advanced_Parameters_Map_Channel
	)
	
	-- outMap.output.invert = inMap.Parameters_Invert_Image
	
	outMap.coords.realWorldScale = off -- use RWS settings but prevent rescaling bug
	
 	try (outmap.bitmap = inmap.Parameters_Source)
 	catch ("No path for [" + inMap.name as string + "]. Please convert manually.")
	
	return outMap
)

fn convertAdskMtl mtl = 
(
    inMat = mtl.ConvertToGeneric

	outMat = StandardMaterial()	
	outMat.name = mtl.name
	
	-- Diffuse
	outMat.Diffuse = inMat.Generic_Color -- transfer diffuse color swatch
	outMat.diffuseMap = (convertAdskMap inMat.Generic_Image) -- transfer diffuse map
	outMat.diffuseMapAmount = inMat.Generic_Image_Fade -- blend with base color
	
	-- Gloss
	outMat.glossiness = inMat.Generic_Glossiness -- gloss slider
	outMat.glossinessMap = (convertAdskMap inMat.Generic_Glossiness_Map) -- gloss texture
	
	-- Reflectivity -> Specular
	outMat.specularLevel = inMat.Reflectivity_Direct -- spec level
	outMat.Specular = color 230 230 230 -- color does not exist for autodesk generic
	outMat.specularMap = (convertAdskMap inMat.Reflectivity_Direct_Map)
	outMat.specularMapEnable=inMat.Reflectivity_Enable  -- set enabled last: adding a map automatically enables
	
	-- Transparency -> Opacity
	-- Translucency map is not used.
	if inMat.Transparency_Enable == true then outMat.opacity = (100 - inMat.Transparency_Amount) else outMat.opacity = 100
	-- outMat.opacityMap = inMat.Transparency_Image --- inverted. not sure if this can be done with maps
	-- outMat.opacityMapEnable = inMat.Transparency_Enable  -- set enabled last: adding a map automatically enables
	outMat.ior = inMat.Transparency_Refraction -- This material type allows for use of index of refraction.
	
	outMat.bumpMap = (convertAdskMap inMat.Bump_Image)
	outMat.bumpMapAmount = inMat.bump_amount
	outMat.bumpMapEnable = inMat.Bump_Enable -- set enabled last: adding a map automatically enables
	
	return outMat
)    

fn convertAdskMtls = 
(
	adskMtls = (getClassInstances Autodesk_Material) 
	for mtl in adskMtls do (
		Replaceinstances mtl (convertAdskMtl mtl)
	)
)

convertAdskMtls ()
